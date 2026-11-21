package wasap

import kotlinx.serialization.json.*
import java.net.InetSocketAddress
import java.time.Instant
import java.util.UUID
import java.util.concurrent.*
import java.util.concurrent.atomic.AtomicBoolean
import javax.net.ssl.*

private data class Pending(val frame: JsonObject, val userId: String?, val conversationId: String?)
// The General conversation is seeded by V1 and has no membership list.
private const val GENERAL_CONVERSATION_ID = "00000000-0000-4000-8000-000000000001"

class TcpServer(
    private val service: Service,
    private val db: Database,
    context: SSLContext,
    host: String,
    requestedPort: Int,
    private val sessions: Sessions = Sessions(DatabaseSessionStore(db)),
    /** Installation CA; its fingerprint is announced in server.hello. */
    private val caCertificate: java.security.cert.X509Certificate? = null,
    /** Builds invite/signup links; without it responses carry only the codes. */
    private val links: EnrollmentLinks? = null,
    /** Shared with the web panel so both count failed PINs together. */
    internal val limiter: LoginLimiter = LoginLimiter(),
    maxConnections: Int = DEFAULT_MAX_CONNECTIONS,
    private val eventBus: EventBus = InMemoryEventBus(),
) : AutoCloseable {
    companion object {
        /** Protocol versions this server accepts; announced in server.hello. */
        val PROTOCOL_VERSIONS = listOf(1)
    }
    private val listener = (context.serverSocketFactory.createServerSocket() as SSLServerSocket).apply {
        enabledProtocols = arrayOf("TLSv1.3", "TLSv1.2")
        reuseAddress = true
        bind(InetSocketAddress(host, requestedPort))
    }
    val port: Int get() = listener.localPort
    private val running = AtomicBoolean(false)
    private val workers = Executors.newVirtualThreadPerTaskExecutor()
    private val clients = ConcurrentHashMap.newKeySet<Client>()
    private val permits = Semaphore(maxConnections)
    private val pinWorkers = Semaphore(4)
    private val writeTimers = Executors.newSingleThreadScheduledExecutor()
    private var eventSubscription: AutoCloseable? = null

    fun start() {
        check(running.compareAndSet(false, true))
        eventSubscription = eventBus.subscribe(::deliverEvent)
        workers.submit {
            while (running.get()) {
                try {
                    val socket = listener.accept() as SSLSocket
                    if (!permits.tryAcquire()) {
                        socket.close()
                    } else {
                        val client = Client(socket)
                        clients.add(client)
                        workers.submit { client.run() }
                    }
                } catch (e: Exception) {
                    if (running.get()) System.err.println("accept failed: ${e.javaClass.simpleName}")
                }
            }
        }
    }
    override fun close() {
        running.set(false)
        eventSubscription?.close()
        listener.close()
        clients.toList().forEach { it.close() }
        writeTimers.shutdownNow()
        workers.shutdownNow()
        workers.awaitTermination(5, TimeUnit.SECONDS)
    }

    /** Tells the class owner's devices that the pending sign-ups changed. */
    private fun signupChanged(recipients: Set<String>, classId: String) {
        val frame = obj("v" to 1, "kind" to "event", "id" to UUID.randomUUID(), "type" to "signup.changed", "payload" to obj("classId" to classId))
        eventBus.publish(SocketEvent(frame, recipients))
    }

    private fun deliverEvent(event: SocketEvent) {
        clients.forEach { client ->
            val recipient = client.cachedUserId() ?: return@forEach
            if (event.audience == null || recipient in event.audience) client.send(event.frame, recipient, event.conversationId)
        }
    }

    private inner class Client(private val socket: SSLSocket) : AutoCloseable {
        private val closed = AtomicBoolean(false)
        private val identityGate = Any()
        private val outgoing = ArrayBlockingQueue<Pending>(128)

        @Volatile private var session: Session? = null

        @Volatile private var writer: Thread? = null
        fun send(frame: JsonObject, userId: String? = session?.user?.id, conversationId: String? = null) {
            if (!closed.get() && !outgoing.offer(Pending(frame, userId, conversationId))) close()
        }
        private fun replaceSession(value: Session?) = synchronized(identityGate) {
            session = value
            outgoing.removeIf { it.userId != null && it.userId != value?.user?.id }
        }

        /** Current session, revalidated against the database at most once per Sessions interval. */
        private fun authenticated(force: Boolean = false): Session {
            val current = session ?: throw ApiError("UNAUTHENTICATED", "Inicia sesión")
            return try {
                sessions.validate(current, force)
            } catch (e: ApiError) {
                replaceSession(null)
                throw e
            }
        }

        /** Identity for routing events, from memory only; the writer revalidates before writing. */
        fun cachedUserId(): String? = session?.takeIf(sessions::isLive)?.user?.id

        /** Rechecks identity and, for conversation frames, membership just before writing. */
        private fun deliverable(pending: Pending): Boolean = try {
            pending.userId == null ||
                (
                    authenticated().user.id == pending.userId &&
                        (pending.conversationId == null || pending.conversationId == GENERAL_CONVERSATION_ID ||
                            service.canAccess(pending.userId, pending.conversationId))
                    )
        } catch (_: Exception) {
            false
        }
        fun run() {
            try {
                socket.soTimeout = 15000
                socket.startHandshake()
                writer = Thread.ofVirtual().start {
                    try {
                        while (!closed.get()) {
                            val pending = outgoing.take()
                            synchronized(identityGate) {
                                if (deliverable(pending)) {
                                    // No database connection, transaction or lock is held while writing:
                                    // a slow reader can only stall its own socket, never the pool.
                                    val timeout = writeTimers.schedule({ close() }, 10, TimeUnit.SECONDS)
                                    try {
                                        Frames.write(socket.outputStream, pending.frame)
                                    } finally {
                                        timeout.cancel(false)
                                    }
                                }
                            }
                        }
                    } catch (_: Exception) {
                        close()
                    }
                }
                val deadline = Instant.now().plusSeconds(15)
                while (!closed.get()) {
                    if (session == null && Instant.now() > deadline) break
                    val request = Frames.read(socket.inputStream) ?: break
                    val id = request.optional("id") ?: break
                    try {
                        uuid(id)
                        if (request["v"]?.jsonPrimitive?.intOrNull !in PROTOCOL_VERSIONS) {
                            throw ApiError("UNSUPPORTED_VERSION", "Versión de protocolo no soportada", obj("supportedVersions" to PROTOCOL_VERSIONS))
                        }
                        if (request.string("kind") != "request") invalid("Se requiere una solicitud")
                        val type = request.string("type")
                        val payload = request["payload"] as? JsonObject ?: invalid("payload debe ser un objeto")
                        val seen = if (type == "messages.seen") service.confirmSeen(authenticated().user.id, payload) else null
                        val result = if (seen != null) obj("seenIds" to seen.ownIds) else when (type) {
                            "ping" -> obj("ready" to db.ready())

                            "server.hello" -> service.serverIdentity().let { identity ->
                                obj(
                                    "serverId" to identity.id,
                                    "name" to identity.name,
                                    "protocolVersions" to PROTOCOL_VERSIONS,
                                    "caFingerprint" to caCertificate?.let(Tls::fingerprint),
                                    "messageReceipts" to true,
                                )
                            }

                            "auth.login" -> {
                                val matricula = payload.string("matricula")
                                val pin = payload.string("pin")
                                if (matricula.length > 32 || pin.length > 12) invalid("Credenciales inválidas")
                                val ipKey = "ip:${socket.inetAddress.hostAddress}"
                                val accountKey = "account:${matricula.trim().uppercase(java.util.Locale.ROOT)}"
                                limiter.check(ipKey, 100)
                                limiter.check(accountKey)
                                // Saturation is not an attempt: no PIN was checked, so nothing is counted.
                                if (!pinWorkers.tryAcquire()) throw ApiError("RATE_LIMITED", "Intenta nuevamente")
                                val user = try {
                                    service.authenticate(matricula, pin)
                                } catch (e: ApiError) {
                                    if (e.code == "INVALID_CREDENTIALS") {
                                        limiter.fail(ipKey)
                                        limiter.fail(accountKey)
                                    }
                                    throw e
                                } finally {
                                    pinWorkers.release()
                                }
                                session?.let { sessions.remove(it.token) }
                                sessions.create(user, user.credentialVersion).also { replaceSession(it) }.toJson()
                            }

                            // Onboarding without a session: same IP limiter and PIN workers as login.
                            "invites.redeem", "signup.request" -> {
                                val ipKey = "ip:${socket.inetAddress.hostAddress}"
                                limiter.check(ipKey, 100)
                                if (!pinWorkers.tryAcquire()) throw ApiError("RATE_LIMITED", "Intenta nuevamente")
                                try {
                                    if (type == "invites.redeem") {
                                        val user = service.redeemInvitation(payload.string("code"), payload.string("pin"))
                                        session?.let { sessions.remove(it.token) }
                                        sessions.create(user, user.credentialVersion).also { replaceSession(it) }.toJson()
                                    } else {
                                        val result = service.requestSignup(payload.string("classCode"), payload.string("matricula"), payload.string("name"), payload.string("pin"))
                                        signupChanged(setOf(result.string("ownerId")), result.string("classId"))
                                        obj("status" to "pending")
                                    }
                                } catch (e: ApiError) {
                                    if (e.code == "INVITATION_INVALID") limiter.fail(ipKey)
                                    throw e
                                } finally {
                                    pinWorkers.release()
                                }
                            }

                            "auth.resume" -> {
                                replaceSession(sessions.get(payload.string("token")))
                                authenticated(force = true).toJson()
                            }

                            "auth.logout" -> {
                                session?.let { sessions.remove(it.token) }
                                replaceSession(null)
                                obj()
                            }

                            else -> withLinks(type, service.call(authenticated().user.id, type, payload, id))
                        }
                        if (session != null) socket.soTimeout = 90000
                        val conversationId = when (type) {
                            "messages.list", "groups.members", "messages.seen" -> payload.uuid("conversationId")
                            else -> null
                        }
                        send(obj("v" to 1, "kind" to "response", "id" to id, "type" to "success", "payload" to result), conversationId = conversationId)
                        // Events are hints, never the only record of a committed operation.
                        try {
                            if (seen == null) {
                                notify(type, payload, result)
                            } else {
                                for ((author, ids) in seen.newByAuthor) {
                                    val data = obj("conversationId" to conversationId, "messageIds" to ids)
                                    val frame = obj("v" to 1, "kind" to "event", "id" to UUID.randomUUID(), "type" to "message.seen", "payload" to data)
                                    eventBus.publish(SocketEvent(frame, setOf(author), conversationId))
                                }
                            }
                        } catch (_: Exception) {
                            System.err.println("event delivery deferred to history sync")
                        }
                    } catch (e: ApiError) {
                        error(id, e.code, e.message, e.details)
                    } catch (e: Exception) {
                        if (isTransientDatabaseFailure(e)) {
                            error(id, "UNAVAILABLE", "La base de datos no está disponible; conserva la solicitud para reintentar")
                        } else {
                            // Log only the exception type and SQLSTATE class: messages may contain user data.
                            System.err.println("request failed: ${e.javaClass.simpleName}${sqlStateClass(e)?.let { " (SQLSTATE class $it)" } ?: ""}")
                            error(id, "INTERNAL", "No se pudo procesar la solicitud")
                        }
                    }
                }
            } catch (_: Exception) { /* Peer disconnected, malformed frame or TLS/read timeout. */ } finally {
                close()
            }
        }

        /** Adds the scannable links to fresh invitation and class codes. */
        private fun withLinks(type: String, result: JsonObject): JsonObject {
            val links = links ?: return result
            return when (type) {
                "invites.create" -> JsonObject(result + ("link" to json(links.invite(result.string("code")))))

                "invites.import" -> JsonObject(
                    result + (
                        "invitations" to JsonArray(
                            result["invitations"]!!.jsonArray.map { JsonObject(it.jsonObject + ("link" to json(links.invite(it.jsonObject.string("code"))))) },
                        )
                        ),
                )

                "classes.code" -> JsonObject(result + ("link" to json(links.signup(result.string("code"), service.className(result.string("classId"))))))

                else -> result
            }
        }

        private fun error(id: String, code: String, message: String, details: JsonObject = JsonObject(emptyMap())) = send(
            obj("v" to 1, "kind" to "response", "id" to id, "type" to "error", "payload" to JsonObject(details + obj("code" to code, "message" to message))),
        )
        private fun notify(type: String, payload: JsonObject, result: JsonObject) {
            val eventType: String
            val data: JsonObject
            when {
                type == "messages.send" -> {
                    eventType = "message.created"
                    data = result
                }

                type == "attendance.mark" -> {
                    eventType = "attendance.changed"
                    data = service.call(session?.user?.id ?: return, "attendance.state", JsonObject(payload.filterKeys { it == "classId" }), UUID.randomUUID().toString())
                }

                type == "signup.approve" || type == "signup.reject" -> {
                    signupChanged(setOf(session?.user?.id ?: return), result.string("classId"))
                    return
                }

                type == "conversations.direct" || (type.startsWith("groups.") && type != "groups.members") -> {
                    eventType = "conversations.changed"
                    data = obj()
                }

                else -> return
            }
            val frame = obj("v" to 1, "kind" to "event", "id" to UUID.randomUUID(), "type" to eventType, "payload" to data)
            val sender = session?.user?.id ?: return
            val conversationId = if (type == "messages.send") result["message"]!!.jsonObject.string("conversationId") else null
            val recipients: Set<String>? = when (eventType) {
                "attendance.changed" -> setOf(sender)
                "conversations.changed" -> service.affectedUsers(type, payload, result)
                else -> conversationId?.takeUnless { it == GENERAL_CONVERSATION_ID }?.let(service::messageAudience)
            }
            eventBus.publish(SocketEvent(frame, recipients, conversationId))
        }
        override fun close() {
            if (closed.compareAndSet(false, true)) {
                clients.remove(this)
                permits.release()
                // A writer blocked on a peer that stopped reading holds the TLS record lock, so
                // SSLSocket.close() would wait for it forever. Socket I/O in a virtual thread is
                // interruptible (the interrupt closes the socket), so interrupt the writer first
                // and close on a separate virtual thread that is itself interrupted if it hangs.
                // Callers (another client's notify, timers) therefore never block here.
                writer?.interrupt()
                val closer = Thread.ofVirtual().start {
                    try {
                        socket.close()
                    } catch (_: Exception) {}
                }
                try {
                    writeTimers.schedule({ closer.interrupt() }, 2, TimeUnit.SECONDS)
                } catch (_: java.util.concurrent.RejectedExecutionException) {
                    closer.interrupt()
                }
            }
        }
    }
}
