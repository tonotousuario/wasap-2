package wasap

import java.net.InetSocketAddress
import java.time.Instant
import java.util.UUID
import java.util.concurrent.*
import java.util.concurrent.atomic.AtomicBoolean
import javax.net.ssl.*
import kotlinx.serialization.json.*

private data class Pending(val frame: JsonObject, val userId: String?, val conversationId: String?)

class TcpServer(private val service: Service, private val db: Database, context: SSLContext, host: String, requestedPort: Int) : AutoCloseable {
    private val listener = (context.serverSocketFactory.createServerSocket() as SSLServerSocket).apply {
        enabledProtocols = arrayOf("TLSv1.3", "TLSv1.2")
        reuseAddress = true
        bind(InetSocketAddress(host, requestedPort))
    }
    val port: Int get() = listener.localPort
    private val running = AtomicBoolean(false)
    private val workers = Executors.newVirtualThreadPerTaskExecutor()
    private val clients = ConcurrentHashMap.newKeySet<Client>()
    private val permits = Semaphore(256)
    private val pinWorkers = Semaphore(4)
    private val sessions = Sessions()
    private val limiter = LoginLimiter()
    private val writeTimers = Executors.newSingleThreadScheduledExecutor()

    fun start() {
        check(running.compareAndSet(false, true))
        workers.submit {
            while (running.get()) try {
                val socket = listener.accept() as SSLSocket
                if (!permits.tryAcquire()) socket.close() else {
                    val client = Client(socket)
                    clients.add(client)
                    workers.submit { client.run() }
                }
            } catch (e: Exception) { if (running.get()) System.err.println("accept failed: ${e.javaClass.simpleName}") }
        }
    }
    override fun close() {
        running.set(false)
        listener.close()
        clients.toList().forEach { it.close() }
        writeTimers.shutdownNow()
        workers.shutdownNow()
        workers.awaitTermination(5, TimeUnit.SECONDS)
    }

    private inner class Client(private val socket: SSLSocket) : AutoCloseable {
        private val closed = AtomicBoolean(false)
        private val identityGate = Any()
        private val outgoing = ArrayBlockingQueue<Pending>(128)
        @Volatile private var session: Session? = null
        private var writer: Thread? = null
        fun send(frame: JsonObject, userId: String? = session?.user?.id, conversationId: String? = null) { if (!closed.get() && !outgoing.offer(Pending(frame, userId, conversationId))) close() }
        private fun replaceSession(value: Session?) = synchronized(identityGate) { session = value; outgoing.removeIf { it.userId != null && it.userId != value?.user?.id } }
        private fun authenticated(): Session {
            val current = session ?: throw ApiError("UNAUTHENTICATED", "Inicia sesión")
            val remembered = sessions.get(current.token)
            if (service.credentialVersion(remembered.user.id) != remembered.credentialVersion) {
                sessions.remove(current.token)
                replaceSession(null)
                throw ApiError("UNAUTHENTICATED", "El PIN cambió; inicia sesión nuevamente")
            }
            return remembered
        }
        fun run() {
            try {
                socket.soTimeout = 15000
                socket.startHandshake()
                writer = Thread.ofVirtual().start {
                    try { while (!closed.get()) {
                        val pending = outgoing.take()
                        synchronized(identityGate) {
                            if (pending.userId == null || try { authenticated().user.id == pending.userId } catch (_: Exception) { false }) {
                                val timeout = writeTimers.schedule({ close() }, 10, TimeUnit.SECONDS)
                                try {
                                    if (pending.conversationId == null) Frames.write(socket.outputStream, pending.frame)
                                    else service.withConversationAccess(pending.userId!!, pending.conversationId) { Frames.write(socket.outputStream, pending.frame) }
                                } finally { timeout.cancel(false) }
                            }
                        }
                    } }
                    catch (_: Exception) { close() }
                }
                val deadline = Instant.now().plusSeconds(15)
                while (!closed.get()) {
                    if (session == null && Instant.now() > deadline) break
                    val request = Frames.read(socket.inputStream) ?: break
                    val id = request.optional("id") ?: break
                    try {
                        uuid(id)
                        if (request["v"]?.jsonPrimitive?.intOrNull != 1) throw ApiError("UNSUPPORTED_VERSION", "Se requiere versión 1")
                        if (request.string("kind") != "request") invalid("Se requiere una solicitud")
                        val type = request.string("type")
                        val payload = request["payload"] as? JsonObject ?: invalid("payload debe ser un objeto")
                        val result = when (type) {
                            "ping" -> obj("ready" to db.ready())
                            "auth.login" -> {
                                val matricula = payload.string("matricula")
                                val pin = payload.string("pin")
                                if (matricula.length > 32 || pin.length > 12) invalid("Credenciales inválidas")
                                limiter.check("ip:${socket.inetAddress.hostAddress}", 100)
                                limiter.check("account:${matricula.trim().uppercase()}")
                                if (!pinWorkers.tryAcquire()) throw ApiError("RATE_LIMITED", "Intenta nuevamente")
                                val user = try { service.authenticate(matricula, pin) } finally { pinWorkers.release() }
                                session?.let { sessions.remove(it.token) }
                                sessions.create(user, user.credentialVersion).also { replaceSession(it) }.toJson()
                            }
                            "auth.resume" -> {
                                replaceSession(sessions.get(payload.string("token")))
                                authenticated().toJson()
                            }
                            "auth.logout" -> {
                                session?.let { sessions.remove(it.token) }; replaceSession(null); obj()
                            }
                            else -> service.call(authenticated().user.id, type, payload, id)
                        }
                        if (session != null) socket.soTimeout = 90000
                        send(obj("v" to 1, "kind" to "response", "id" to id, "type" to "success", "payload" to result), conversationId = if (type == "messages.list" || type == "groups.members") payload.uuid("conversationId") else null)
                        // Events are hints, never the only record of a committed operation.
                        try { notify(type, result) } catch (_: Exception) { System.err.println("event delivery deferred to history sync") }
                    } catch (e: ApiError) { error(id, e.code, e.message) }
                    catch (e: java.sql.SQLException) { error(id, "UNAVAILABLE", "La base de datos no está disponible; conserva la solicitud para reintentar") }
                    catch (e: Exception) { System.err.println("request failed: ${e.javaClass.simpleName}"); error(id, "INTERNAL", "No se pudo procesar la solicitud") }
                }
            } catch (_: Exception) { /* Peer disconnected, malformed frame or TLS/read timeout. */ }
            finally { close() }
        }
        private fun error(id: String, code: String, message: String) = send(obj("v" to 1, "kind" to "response", "id" to id, "type" to "error", "payload" to obj("code" to code, "message" to message)))
        private fun notify(type: String, result: JsonObject) {
            val eventType: String
            val data: JsonObject
            when {
                type == "messages.send" -> { eventType = "message.created"; data = result }
                type == "attendance.mark" -> { eventType = "attendance.changed"; data = service.call(authenticated().user.id, "attendance.state", obj(), UUID.randomUUID().toString()) }
                type == "conversations.direct" || type.startsWith("groups.") && type != "groups.members" -> { eventType = "conversations.changed"; data = obj() }
                else -> return
            }
            val frame = obj("v" to 1, "kind" to "event", "id" to UUID.randomUUID(), "type" to eventType, "payload" to data)
            val sender = session?.user?.id
            // ponytail: per-socket permission queries suit a small LAN; batch membership for larger deployments.
            clients.forEach { client ->
                val recipient = try { client.authenticated().user.id } catch (_: Exception) { null }
                if (recipient != null && when (type) {
                    "attendance.mark" -> recipient == sender
                    "messages.send" -> true
                    else -> true
                }) client.send(frame, recipient, if (type == "messages.send") result["message"]!!.jsonObject.string("conversationId") else null)
            }
        }
        override fun close() {
            if (closed.compareAndSet(false, true)) {
                socket.close()
                writer?.interrupt()
                clients.remove(this)
                permits.release()
            }
        }
    }
}
