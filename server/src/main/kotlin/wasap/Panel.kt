package wasap

import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpsConfigurator
import com.sun.net.httpserver.HttpsParameters
import com.sun.net.httpserver.HttpsServer
import kotlinx.serialization.json.*
import java.net.InetSocketAddress
import java.net.URLDecoder
import java.net.URLEncoder
import java.nio.charset.StandardCharsets.UTF_8
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import java.util.UUID
import java.util.concurrent.Executors
import javax.net.ssl.SSLContext

/** PANEL_ENABLED: the panel runs unless it is explicitly "false". */
fun panelEnabled(value: String?) = value?.trim()?.lowercase() != "false"

/** Signed-in panel user, with the role read from the database on this request. */
data class PanelUser(val id: String, val matricula: String, val name: String, val role: String, val csrf: String) {
    val admin get() = role == "admin"
}

/** Web panel sessions: SHA-256 of the cookie token, 8 h absolute and 30 min idle lifetime. */
class PanelSessions(private val db: Database) {
    private val random = SecureRandom()
    private fun token() = ByteArray(32).also(random::nextBytes).let { Base64.getUrlEncoder().withoutPadding().encodeToString(it) }
    private fun hash(token: String) = MessageDigest.getInstance("SHA-256").digest(token.toByteArray())

    /** Returns the cookie token for a new session of [userId]. */
    fun create(userId: String): String = token().also { token ->
        db.transaction { it.exec("INSERT INTO panel_sessions(token_hash,user_id,csrf) VALUES (?,?::uuid,?)", hash(token), userId, token()) }
    }

    /** The live session's user, only while they are still an active admin or teacher. */
    fun find(token: String): PanelUser? = db.transaction { c ->
        val row = c.rows(
            """
            UPDATE panel_sessions s SET last_seen_at = now() FROM users u
            WHERE s.token_hash = ? AND u.id = s.user_id AND u.status = 'active' AND u.role IN ('admin','teacher')
              AND s.created_at > now() - interval '8 hours' AND s.last_seen_at > now() - interval '30 minutes'
            RETURNING u.id::text AS id, u.matricula, u.name, u.role, s.csrf
            """,
            hash(token),
        ).firstOrNull()
        if (row == null) c.exec("DELETE FROM panel_sessions WHERE token_hash = ?", hash(token))
        row?.let { PanelUser(it.string("id"), it.string("matricula"), it.string("name"), it.string("role"), it.string("csrf")) }
    }

    fun delete(token: String) {
        db.transaction { it.exec("DELETE FROM panel_sessions WHERE token_hash = ?", hash(token)) }
    }

    fun purgeExpired(): Int = db.transaction {
        it.exec("DELETE FROM panel_sessions WHERE created_at <= now() - interval '8 hours' OR last_seen_at <= now() - interval '30 minutes'")
    }
}

/** What the panel needs to manage certificates; absent when the server has no CA directory. */
class PanelCertificates(val tls: TlsDirectory, val detectAddresses: () -> List<String>, val afterIssue: () -> Unit)

private class Reply(val status: Int, val body: ByteArray, val type: String, val headers: Map<String, String> = emptyMap())
private class Redirect(val location: String) : RuntimeException(null, null, false, false)
private class NotFound : RuntimeException(null, null, false, false)

/**
 * HTTPS administration panel on its own port (admin-web-panel). Server-rendered HTML without
 * JavaScript; every change is a POST with the session's anti-CSRF token. Permissions are the
 * protocol's: class operations go through [Service.call] as the signed-in user.
 */
class PanelServer(
    private val service: Service,
    db: Database,
    context: SSLContext,
    host: String,
    port: Int,
    private val limiter: LoginLimiter,
    private val links: EnrollmentLinks? = null,
    private val certificates: PanelCertificates? = null,
) : AutoCloseable {
    val sessions = PanelSessions(db)
    private val server = HttpsServer.create(InetSocketAddress(host, port), 64)
    private val executor = Executors.newVirtualThreadPerTaskExecutor()
    private val random = SecureRandom()
    val port: Int get() = server.address.port

    init {
        server.httpsConfigurator = object : HttpsConfigurator(context) {
            override fun configure(params: HttpsParameters) {
                params.setSSLParameters(context.defaultSSLParameters.apply { protocols = arrayOf("TLSv1.3", "TLSv1.2") })
            }
        }
        server.executor = executor
        server.createContext("/") { exchange -> exchange.use { handle(it) } }
    }

    fun start() = server.start()

    override fun close() {
        server.stop(0)
        executor.shutdownNow()
    }

    companion object {
        const val MAX_BODY = 1 shl 20
        const val COOKIE = "wasap_panel"
        const val LOGIN_COOKIE = "wasap_login"
        private val CSS = PanelServer::class.java.getResource("/panel.css")!!.readBytes()

        /** Strict policy: no scripts at all, styles only from /panel.css, QR images inline. */
        val SECURITY_HEADERS = mapOf(
            "Content-Security-Policy" to "default-src 'none'; style-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
            "X-Frame-Options" to "DENY",
            "Referrer-Policy" to "no-referrer",
            "X-Content-Type-Options" to "nosniff",
            "Cache-Control" to "no-store",
        )
    }

    // ---- Plumbing ----

    private fun handle(exchange: HttpExchange) {
        val reply = try {
            route(exchange)
        } catch (r: Redirect) {
            Reply(303, ByteArray(0), "text/plain", mapOf("Location" to r.location))
        } catch (_: NotFound) {
            page(404, "No encontrada", null) { tag("p") { +"La página o la clase no existe." } }
        } catch (e: ApiError) {
            page(if (e.code == "FORBIDDEN") 403 else 400, "No se pudo", null) { tag("p") { +e.message } }
        } catch (e: Exception) {
            System.err.println("panel request failed: ${e.javaClass.simpleName}")
            page(500, "Error", null) { tag("p") { +"No se pudo procesar la solicitud." } }
        }
        SECURITY_HEADERS.forEach { (k, v) -> exchange.responseHeaders.set(k, v) }
        reply.headers.forEach { (k, v) -> exchange.responseHeaders.add(k, v) }
        exchange.responseHeaders.set("Content-Type", reply.type)
        exchange.sendResponseHeaders(reply.status, if (reply.body.isEmpty()) -1 else reply.body.size.toLong())
        if (reply.body.isNotEmpty()) exchange.responseBody.use { it.write(reply.body) }
    }

    private fun cookies(exchange: HttpExchange): Map<String, String> = exchange.requestHeaders["Cookie"].orEmpty()
        .flatMap { it.split(';') }.mapNotNull { part -> part.trim().split('=', limit = 2).takeIf { it.size == 2 }?.let { it[0] to it[1] } }.toMap()

    private fun query(exchange: HttpExchange) = decodeForm(exchange.requestURI.rawQuery ?: "")

    private fun decodeForm(raw: String): Map<String, String> = raw.split('&').filter { it.isNotEmpty() }.associate { pair ->
        val (k, v) = (pair.split('=', limit = 2) + "").take(2)
        URLDecoder.decode(k, UTF_8) to URLDecoder.decode(v, UTF_8)
    }

    private fun form(exchange: HttpExchange): Map<String, String> {
        val body = exchange.requestBody.readNBytes(MAX_BODY + 1)
        if (body.size > MAX_BODY) throw ApiError("VALIDATION", "La solicitud es demasiado grande")
        return decodeForm(String(body, UTF_8))
    }

    private fun Map<String, String>.need(key: String) = this[key]?.trim()?.takeIf { it.isNotEmpty() } ?: throw ApiError("VALIDATION", "Falta $key")

    private fun cookie(name: String, value: String, maxAge: Int) = "$name=$value; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=$maxAge"

    private fun token() = ByteArray(24).also(random::nextBytes).let { Base64.getUrlEncoder().withoutPadding().encodeToString(it) }

    private fun back(path: String, ok: String? = null, error: String? = null): Nothing {
        val message = listOfNotNull(ok?.let { "ok=" + URLEncoder.encode(it, UTF_8) }, error?.let { "error=" + URLEncoder.encode(it, UTF_8) })
        throw Redirect(if (message.isEmpty()) path else "$path?${message.joinToString("&")}")
    }

    // ---- Routing ----

    private fun route(exchange: HttpExchange): Reply {
        val method = exchange.requestMethod
        val path = exchange.requestURI.path
        if (method == "GET" && path == "/panel.css") return Reply(200, CSS, "text/css; charset=utf-8")
        if (path == "/login") return if (method == "POST") login(exchange) else loginPage(null)
        val token = cookies(exchange)[COOKIE]
        val user = token?.let(sessions::find)
        if (user == null) {
            if (method == "POST") return page(403, "Sesión terminada", null) { tag("p") { +"Vuelve a entrar al panel." } }
            throw Redirect("/login")
        }
        if (method == "POST") {
            val form = form(exchange)
            // Every change needs this session's token: a missing or foreign one changes nothing.
            if (!MessageDigest.isEqual((form["csrf"] ?: "").toByteArray(), user.csrf.toByteArray())) {
                return page(403, "Solicitud no válida", user) { tag("p") { +"El formulario caducó. Vuelve a la página e inténtalo de nuevo." } }
            }
            return post(exchange, user, token, path, form)
        }
        if (method != "GET") return Reply(405, ByteArray(0), "text/plain")
        val q = query(exchange)
        val parts = path.trim('/').split('/')
        return when {
            path == "/" -> home(user, q)
            path == "/classes" -> home(user, q)
            parts.size == 2 && parts[0] == "classes" -> classPage(user, parts[1], q)
            parts.size == 3 && parts[0] == "classes" && parts[2] == "attendance.csv" -> classCsv(user, parts[1], q)
            path == "/users" -> admin(user) { usersPage(user, q) }
            path == "/server" -> admin(user) { serverPage(user, q) }
            path == "/server/qr.png" -> admin(user) { Reply(200, ServerQr.pngBytes(ServerQr.matrix(links?.server() ?: throw NotFound())), "image/png", mapOf("Content-Disposition" to "attachment; filename=\"wasap-servidor.png\"")) }
            path == "/attendance.csv" -> admin(user) { csv("asistencia-general", service.attendanceCsv(null, obj("door" to true, "from" to q["from"].nonEmpty(), "to" to q["to"].nonEmpty()))) }
            path == "/audit" -> auditPage(user, q)
            else -> throw NotFound()
        }
    }

    private fun String?.nonEmpty() = this?.trim()?.takeIf { it.isNotEmpty() }

    private fun admin(user: PanelUser, block: () -> Reply): Reply = if (user.admin) block() else throw NotFound()

    /** Class operations as the signed-in user; another teacher's class is simply "not found". */
    private fun <T> asClassUser(block: () -> T): T = try {
        block()
    } catch (e: ApiError) {
        if (e.code == "FORBIDDEN" || e.code == "NOT_FOUND") throw NotFound() else throw e
    }

    private fun call(user: PanelUser, type: String, payload: JsonObject) = service.call(user.id, type, payload, UUID.randomUUID().toString())

    private fun post(exchange: HttpExchange, user: PanelUser, token: String, path: String, form: Map<String, String>): Reply {
        val parts = path.trim('/').split('/')
        if (path == "/logout") {
            sessions.delete(token)
            return Reply(303, ByteArray(0), "text/plain", mapOf("Location" to "/login", "Set-Cookie" to cookie(COOKIE, "", 0)))
        }
        if (parts.size >= 3 && parts[0] == "classes") {
            val classId = parts[1]
            val home = "/classes/$classId"
            asClassUser { service.panelClass(user.id, classId) }
            fun attempt(ok: String, action: () -> Unit): Nothing = try {
                action()
                back(home, ok = ok)
            } catch (e: ApiError) {
                if (e.code == "FORBIDDEN" || e.code == "NOT_FOUND") throw NotFound()
                back(home, error = e.message)
            }
            when (parts.drop(2).joinToString("/")) {
                "members/add" -> attempt("Integrante añadido") { call(user, "groups.add", obj("conversationId" to classId, "matricula" to form.need("matricula"))) }

                "members/remove" -> attempt("Integrante retirado") { call(user, "groups.remove", obj("conversationId" to classId, "matricula" to form.need("matricula"))) }

                "code/renew" -> attempt("Código renovado; el anterior ya no sirve") { call(user, "classes.code", obj("classId" to classId, "renew" to true)) }

                "signups/approve" -> attempt("Solicitud aprobada") { call(user, "signup.approve", obj("matricula" to form.need("matricula"))) }

                "signups/reject" -> attempt("Solicitud rechazada") { call(user, "signup.reject", obj("matricula" to form.need("matricula"))) }

                "invites/revoke" -> attempt("Invitación revocada") { call(user, "invites.revoke", obj("id" to form.need("id"))) }

                "invites" -> {
                    val days = form["days"].nonEmpty()?.toIntOrNull() ?: 7
                    val created = try {
                        if (form["csv"].nonEmpty() != null) {
                            call(user, "invites.import", obj("classId" to classId, "csv" to form.need("csv"), "days" to days))["invitations"]!!.jsonArray.map { it.jsonObject }
                        } else {
                            val one = call(user, "invites.create", obj("classId" to classId, "matricula" to form.need("matricula"), "name" to form.need("name"), "days" to days))
                            listOf(JsonObject(one["invitation"]!!.jsonObject + ("code" to one["code"]!!)))
                        }
                    } catch (e: ApiError) {
                        if (e.code == "FORBIDDEN" || e.code == "NOT_FOUND") throw NotFound()
                        back(home, error = e.message)
                    }
                    return invitationsPrint(user, classId, created)
                }

                else -> throw NotFound()
            }
        }
        if (!user.admin) throw NotFound()
        fun attempt(home: String, ok: String, action: () -> Unit): Nothing = try {
            action()
            back(home, ok = ok)
        } catch (e: ApiError) {
            back(home, error = e.message)
        }
        return when (path) {
            "/users/add" -> {
                val pin = form.need("pin")
                if (pin != form["pin2"]) back("/users", error = "Los PIN no coinciden")
                attempt("/users", "Cuenta creada") { service.createUser(form.need("matricula"), form.need("name"), pin, user.id) }
            }

            "/users/role" -> attempt("/users", "Rol actualizado") { service.setRole(form.need("matricula"), form.need("role"), user.id) }

            "/users/pin" -> {
                val pin = form.need("pin")
                attempt("/users", "PIN restablecido; sus sesiones se cerraron") { service.resetPin(form.need("matricula"), pin, user.id) }
            }

            "/users/logout" -> attempt("/users", "Sesiones cerradas") { service.logoutUser(form.need("matricula"), user.id) }

            "/server/name" -> attempt("/server", "Nombre actualizado") { service.renameServer(form.need("name"), user.id) }

            "/server/certs" -> {
                val certs = certificates ?: back("/server", error = "Este servidor no gestiona sus certificados (no hay TLS_DIR)")
                val addresses = form["addresses"].orEmpty().split(Regex("[\\s,]+")).filter { it.isNotEmpty() }
                val dns = form["dns"].orEmpty().split(Regex("[\\s,]+")).filter { it.isNotEmpty() }
                val passphrase = form.need("passphrase").toCharArray()
                try {
                    // The passphrase lives only for this request and is never logged or audited.
                    val issued = CertificateAuthority.issue(certs.tls, passphrase, addresses, dns)
                    certs.afterIssue()
                    service.audit(user.id, "cert.issue", mapOf("addresses" to issued.addresses, "dnsNames" to issued.dnsNames, "notAfter" to issued.notAfter))
                    back("/server", ok = "Certificado emitido hasta ${issued.notAfter}; ya está en uso")
                } catch (e: ApiError) {
                    back("/server", error = e.message)
                } finally {
                    passphrase.fill('\u0000')
                }
            }

            else -> throw NotFound()
        }
    }

    // ---- Login ----

    private fun loginPage(problem: String?, status: Int = 200): Reply {
        val csrf = token()
        return page(status, "Entrar al panel", null, mapOf("Set-Cookie" to cookie(LOGIN_COOKIE, csrf, 600))) {
            tag("p", "class" to "lead") { +"Panel de administración y profesores. Los estudiantes usan la app." }
            problem?.let { tag("p", "class" to "notice error", "role" to "alert") { +it } }
            form("/login", csrf, "class" to "card narrow") {
                field("Matrícula", "matricula", extra = arrayOf("autocomplete" to "username", "required" to true))
                field("PIN", "pin", "password", extra = arrayOf("inputmode" to "numeric", "autocomplete" to "current-password", "required" to true))
                button("Entrar", "class" to "primary")
            }
        }
    }

    private fun login(exchange: HttpExchange): Reply {
        val form = form(exchange)
        val expected = cookies(exchange)[LOGIN_COOKIE]
        if (expected == null || !MessageDigest.isEqual(expected.toByteArray(), (form["csrf"] ?: "").toByteArray())) {
            return loginPage("El formulario caducó; inténtalo de nuevo.", 403)
        }
        val matricula = form["matricula"].orEmpty().trim()
        val pin = form["pin"].orEmpty()
        val ipKey = "ip:${exchange.remoteAddress.address.hostAddress}"
        val accountKey = "account:${matricula.uppercase(java.util.Locale.ROOT)}"
        val user = try {
            if (matricula.length > 32 || pin.length > 12) throw ApiError("INVALID_CREDENTIALS", "Matrícula o PIN incorrectos")
            limiter.check(ipKey, 100)
            limiter.check(accountKey)
            service.authenticate(matricula, pin)
        } catch (e: ApiError) {
            if (e.code == "INVALID_CREDENTIALS") {
                limiter.fail(ipKey)
                limiter.fail(accountKey)
            }
            return loginPage(if (e.code == "RATE_LIMITED") "Demasiados intentos; espera unos minutos." else "Matrícula o PIN incorrectos.", 401)
        }
        if (user.role !in setOf("admin", "teacher")) {
            return loginPage("Acceso denegado: el panel es solo para profesores y administración.", 403)
        }
        val token = sessions.create(user.id)
        return Reply(303, ByteArray(0), "text/plain", mapOf("Location" to "/", "Set-Cookie" to cookie(COOKIE, token, 8 * 3600)))
    }

    // ---- Pages ----

    private fun page(status: Int, title: String, user: PanelUser?, headers: Map<String, String> = emptyMap(), q: Map<String, String> = emptyMap(), body: Html.() -> Unit): Reply {
        val identity = service.serverIdentity()
        val markup = "<!doctype html>" + html {
            tag("html", "lang" to "es") {
                tag("head") {
                    void("meta", "charset" to "utf-8")
                    void("meta", "name" to "viewport", "content" to "width=device-width, initial-scale=1")
                    tag("title") { +"$title · ${identity.name}" }
                    void("link", "rel" to "stylesheet", "href" to "/panel.css")
                }
                tag("body") {
                    tag("header", "class" to "bar") {
                        tag("div", "class" to "brand") {
                            tag("strong") { +"Wasap" }
                            tag("span") { +identity.name }
                        }
                        if (user != null) {
                            tag("nav") {
                                a("/") { +"Clases" }
                                if (user.admin) {
                                    a("/users") { +"Usuarios" }
                                    a("/server") { +"Servidor" }
                                }
                                a("/audit") { +"Auditoría" }
                            }
                            form("/logout", user.csrf, "class" to "who") {
                                tag("span") { +"${user.name} · ${if (user.admin) "Administración" else "Profesor"}" }
                                button("Salir", "class" to "link")
                            }
                        }
                    }
                    tag("main") {
                        h1(title)
                        q["ok"]?.let { tag("p", "class" to "notice ok", "role" to "status") { +it } }
                        q["error"]?.let { tag("p", "class" to "notice error", "role" to "alert") { +it } }
                        body()
                    }
                }
            }
        }
        return Reply(status, markup.toByteArray(), "text/html; charset=utf-8", headers)
    }

    private fun csv(name: String, content: String) = Reply(
        200,
        ("" + content).toByteArray(),
        "text/csv; charset=utf-8",
        mapOf("Content-Disposition" to "attachment; filename=\"$name.csv\""),
    )

    private fun home(user: PanelUser, q: Map<String, String>): Reply {
        val classes = service.panelClasses(user.id)
        return page(200, if (user.admin) "Todas las clases" else "Mis clases", user, q = q) {
            if (classes.isEmpty()) {
                tag("p", "class" to "empty") { +"Aún no hay clases. Se crean desde la app con «Crear grupo → Clase con asistencia»." }
            }
            tag("ul", "class" to "cards") {
                classes.forEach { k ->
                    tag("li") {
                        a("/classes/${k.string("id")}", "class" to "card link-card") {
                            tag("strong") { +k.string("name") }
                            tag("span") { +"${k["members"]} integrantes · responsable ${k.string("ownerName")}" }
                            val pending = k["pending"]!!.jsonPrimitive.int
                            if (pending > 0) tag("span", "class" to "badge") { +"$pending pendientes" }
                        }
                    }
                }
            }
            if (user.admin) {
                h2("Puerta general")
                dateRangeForm("/attendance.csv", "Exportar CSV de la puerta general", q)
            }
        }
    }

    /** GET form with Desde/Hasta; dates are inclusive in the server's time zone. */
    private fun Html.dateRangeForm(action: String, label: String, q: Map<String, String>) = tag("form", "method" to "get", "action" to action, "class" to "inline") {
        field("Desde", "from", "date", q["from"])
        field("Hasta", "to", "date", q["to"])
        button(label)
    }

    private fun classPage(user: PanelUser, classId: String, q: Map<String, String>): Reply {
        val k = asClassUser { service.panelClass(user.id, classId) }
        val owner = k["isOwner"]!!.jsonPrimitive.boolean
        val code = asClassUser { call(user, "classes.code", obj("classId" to classId)) }.string("code")
        val requests = call(user, "signup.list", obj("classId" to classId))["requests"]!!.jsonArray.map { it.jsonObject }
        val invites = call(user, "invites.list", obj("classId" to classId))["invitations"]!!.jsonArray.map { it.jsonObject }
        val report = call(user, "attendance.classReport", obj("classId" to classId, "from" to q["from"].nonEmpty(), "to" to q["to"].nonEmpty(), "limit" to 100))
        val events = report["events"]!!.jsonArray.map { it.jsonObject }
        val zone = service.zone
        val clock = java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm").withZone(zone)
        return page(200, k.string("name"), user, q = q) {
            tag("section", "class" to "grid") {
                tag("div", "class" to "card") {
                    h2("Código de autorregistro")
                    tag("p", "class" to "code") { +code }
                    links?.let { tag("div", "class" to "qr") { trusted(ServerQr.svg(ServerQr.matrix(it.signup(code, k.string("name")), margin = 2))) } }
                    tag("p", "class" to "hint") { +"Los estudiantes lo escanean o lo escriben en «Soy nuevo». Renovarlo invalida el anterior." }
                    form("/classes/$classId/code/renew", user.csrf) { button("Renovar código") }
                }
                tag("div", "class" to "card") {
                    h2("Solicitudes pendientes")
                    if (requests.isEmpty()) tag("p", "class" to "empty") { +"No hay solicitudes." }
                    requests.forEach { r ->
                        tag("div", "class" to "row") {
                            tag("span") { +"${r.string("name")} · ${r.string("matricula")}" }
                            form("/classes/$classId/signups/approve", user.csrf, "class" to "inline") {
                                void("input", "type" to "hidden", "name" to "matricula", "value" to r.string("matricula"))
                                button("Aprobar", "class" to "primary")
                            }
                            form("/classes/$classId/signups/reject", user.csrf, "class" to "inline") {
                                void("input", "type" to "hidden", "name" to "matricula", "value" to r.string("matricula"))
                                button("Rechazar")
                            }
                        }
                    }
                }
            }
            h2("Invitaciones")
            tag("section", "class" to "grid") {
                form("/classes/$classId/invites", user.csrf, "class" to "card") {
                    tag("h3") { +"Una persona" }
                    field("Matrícula", "matricula")
                    field("Nombre completo", "name")
                    field("Días de validez", "days", "number", "7", "min" to 1, "max" to 30)
                    button("Crear invitación", "class" to "primary")
                }
                form("/classes/$classId/invites", user.csrf, "class" to "card") {
                    tag("h3") { +"Lista (CSV)" }
                    tag("label", "class" to "field") {
                        tag("span") { +"Una línea por estudiante: matrícula,nombre" }
                        tag("textarea", "name" to "csv", "rows" to 6, "placeholder" to "20260001,Ana Pérez") {}
                    }
                    field("Días de validez", "days", "number", "7", "min" to 1, "max" to 30)
                    button("Crear e imprimir QR", "class" to "primary")
                }
            }
            if (invites.isNotEmpty()) {
                tag("table") {
                    tag("thead") { tag("tr") { listOf("Matrícula", "Nombre", "Estado", "Caduca", "").forEach { tag("th") { +it } } } }
                    tag("tbody") {
                        invites.take(100).forEach { i ->
                            tag("tr") {
                                tag("td") { +i.string("matricula") }
                                tag("td") { +i.string("name") }
                                tag("td") { +mapOf("open" to "Abierta", "used" to "Usada", "expired" to "Caducada", "revoked" to "Revocada")[i.string("status")].orEmpty() }
                                tag("td") { +clock.format(java.time.Instant.parse(i.string("expiresAt"))) }
                                tag("td") {
                                    if (i.string("status") == "open") {
                                        form("/classes/$classId/invites/revoke", user.csrf, "class" to "inline") {
                                            void("input", "type" to "hidden", "name" to "id", "value" to i.string("id"))
                                            button("Revocar", "class" to "link")
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            h2("Integrantes (${k["members"]!!.jsonArray.size})")
            if (owner) {
                form("/classes/$classId/members/add", user.csrf, "class" to "inline") {
                    field("Matrícula", "matricula")
                    button("Añadir")
                }
            }
            tag("table") {
                tag("tbody") {
                    k["members"]!!.jsonArray.map { it.jsonObject }.forEach { m ->
                        tag("tr") {
                            tag("td") { +m.string("matricula") }
                            tag("td") { +m.string("name") }
                            tag("td") {
                                if (owner && m.string("matricula") != user.matricula) {
                                    form("/classes/$classId/members/remove", user.csrf, "class" to "inline") {
                                        void("input", "type" to "hidden", "name" to "matricula", "value" to m.string("matricula"))
                                        button("Retirar", "class" to "link")
                                    }
                                }
                            }
                        }
                    }
                }
            }
            h2("Asistencia")
            dateRangeForm("/classes/$classId", "Ver", q)
            a("/classes/$classId/attendance.csv?from=${URLEncoder.encode(q["from"].orEmpty(), UTF_8)}&to=${URLEncoder.encode(q["to"].orEmpty(), UTF_8)}", "class" to "button") { +"Exportar CSV de este periodo" }
            if (events.isEmpty()) tag("p", "class" to "empty") { +"Sin movimientos en este periodo." }
            tag("table") {
                tag("tbody") {
                    events.forEach { e ->
                        tag("tr") {
                            tag("td") { +clock.format(java.time.Instant.parse(e.string("recordedAt"))) }
                            tag("td") { +e.string("matricula") }
                            tag("td") { +e.string("name") }
                            tag("td") { +(if (e.string("type") == "ENTRY") "Entrada" else "Salida") }
                        }
                    }
                }
            }
            if (report.optional("nextCursor") != null) tag("p", "class" to "hint") { +"Se muestran los 100 más recientes; el CSV incluye todos." }
        }
    }

    private fun classCsv(user: PanelUser, classId: String, q: Map<String, String>): Reply {
        val content = asClassUser { service.classAttendanceCsv(user.id, classId, q["from"].nonEmpty(), q["to"].nonEmpty()) }
        return csv("asistencia-clase", content)
    }

    /** Printable sheet: one card per invitation with its QR; shown once (codes are not stored). */
    private fun invitationsPrint(user: PanelUser, classId: String, created: List<JsonObject>): Reply = page(200, "Invitaciones para imprimir", user) {
        tag("p", "class" to "hint noprint") { +"Imprime esta hoja ahora: los códigos no se guardan y no se podrán volver a mostrar." }
        a("/classes/$classId", "class" to "button noprint") { +"Volver a la clase" }
        tag("div", "class" to "sheet") {
            created.forEach { i ->
                tag("div", "class" to "invite") {
                    tag("strong") { +i.string("name") }
                    tag("span") { +i.string("matricula") }
                    val code = i.string("code")
                    links?.let { tag("div", "class" to "qr") { trusted(ServerQr.svg(ServerQr.matrix(it.invite(code), margin = 2))) } }
                    tag("code") { +code }
                    tag("span", "class" to "hint") { +"Escanéalo con Wasap y elige tu PIN. Un solo uso." }
                }
            }
        }
    }

    private fun usersPage(user: PanelUser, q: Map<String, String>): Reply {
        val users = service.panelUsers(q["q"])
        return page(200, "Usuarios", user, q = q) {
            tag("form", "method" to "get", "action" to "/users", "class" to "inline") {
                field("Buscar", "q", "search", q["q"])
                button("Buscar")
            }
            tag("table") {
                tag("thead") { tag("tr") { listOf("Matrícula", "Nombre", "Rol", "Estado", "Sesiones", "Acciones").forEach { tag("th") { +it } } } }
                tag("tbody") {
                    users.forEach { u ->
                        val m = u.string("matricula")
                        tag("tr") {
                            tag("td") { +m }
                            tag("td") { +u.string("name") }
                            tag("td") {
                                form("/users/role", user.csrf, "class" to "inline") {
                                    void("input", "type" to "hidden", "name" to "matricula", "value" to m)
                                    tag("select", "name" to "role", "aria-label" to "Rol de $m") {
                                        listOf("student" to "Estudiante", "teacher" to "Profesor", "admin" to "Administración").forEach { (value, label) ->
                                            tag("option", "value" to value, "selected" to (u.string("role") == value)) { +label }
                                        }
                                    }
                                    button("Cambiar", "class" to "link")
                                }
                            }
                            tag("td") { +(if (u.string("status") == "pending") "Pendiente" else "Activa") }
                            tag("td") { +u["sessions"].toString() }
                            tag("td") {
                                form("/users/pin", user.csrf, "class" to "inline") {
                                    void("input", "type" to "hidden", "name" to "matricula", "value" to m)
                                    void("input", "type" to "password", "name" to "pin", "inputmode" to "numeric", "placeholder" to "PIN nuevo", "aria-label" to "PIN nuevo de $m", "autocomplete" to "new-password")
                                    button("Restablecer", "class" to "link")
                                }
                                form("/users/logout", user.csrf, "class" to "inline") {
                                    void("input", "type" to "hidden", "name" to "matricula", "value" to m)
                                    button("Cerrar sesiones", "class" to "link")
                                }
                            }
                        }
                    }
                }
            }
            h2("Nueva cuenta")
            tag("p", "class" to "hint") { +"Mejor con una invitación desde la clase: así el estudiante elige su PIN y nadie más lo conoce." }
            form("/users/add", user.csrf, "class" to "card narrow") {
                field("Matrícula", "matricula")
                field("Nombre completo", "name")
                field("PIN inicial", "pin", "password", extra = arrayOf("inputmode" to "numeric", "autocomplete" to "new-password"))
                field("Repite el PIN", "pin2", "password", extra = arrayOf("inputmode" to "numeric", "autocomplete" to "new-password"))
                button("Crear cuenta", "class" to "primary")
            }
        }
    }

    private fun serverPage(user: PanelUser, q: Map<String, String>): Reply {
        val identity = service.serverIdentity()
        return page(200, "Servidor", user, q = q) {
            tag("section", "class" to "grid") {
                tag("div", "class" to "card") {
                    h2("Código QR del servidor")
                    val link = links?.server()
                    if (link == null) {
                        tag("p", "class" to "empty") { +"No hay CA configurada para generar el QR." }
                    } else {
                        tag("div", "class" to "qr") { trusted(ServerQr.svg(ServerQr.matrix(link, margin = 2))) }
                        a("/server/qr.png", "class" to "button") { +"Descargar PNG para imprimir" }
                        tag("details") {
                            tag("summary") { +"Enlace en texto" }
                            tag("code", "class" to "wrap") { +link }
                        }
                    }
                }
                form("/server/name", user.csrf, "class" to "card") {
                    h2("Nombre")
                    field("Nombre que ven los teléfonos", "name", value = identity.name, extra = arrayOf("maxlength" to 80))
                    tag("p", "class" to "hint") { +"Identificador: ${identity.id}" }
                    button("Guardar", "class" to "primary")
                }
            }
            h2("Certificados")
            val certs = certificates
            if (certs == null) {
                tag("p", "class" to "empty") { +"Este servidor usa un certificado provisto (TLS_KEYSTORE); se gestiona fuera del panel." }
            } else {
                tag("pre", "class" to "status") { +CertificateStatus.describe(certs.tls) }
                form("/server/certs", user.csrf, "class" to "card narrow") {
                    tag("label", "class" to "field") {
                        tag("span") { +"Direcciones IP (una por línea; detectadas en este equipo)" }
                        tag("textarea", "name" to "addresses", "rows" to 4) { +certs.detectAddresses().joinToString("\n") }
                    }
                    field("Nombres DNS (opcional)", "dns")
                    field("Frase de la CA", "passphrase", "password", extra = arrayOf("autocomplete" to "off", "required" to true))
                    tag("p", "class" to "hint") { +"La frase solo se usa para esta emisión; no se guarda ni se registra." }
                    button("Emitir certificado", "class" to "primary")
                }
            }
        }
    }

    private fun auditPage(user: PanelUser, q: Map<String, String>): Reply {
        val log = service.auditLog(user.id, q["from"].nonEmpty(), q["to"].nonEmpty(), q["before"]?.toLongOrNull())
        val clock = java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(service.zone)
        return page(200, "Auditoría", user, q = q) {
            if (!user.admin) tag("p", "class" to "hint") { +"Solo acciones sobre tus clases." }
            dateRangeForm("/audit", "Filtrar", q)
            tag("table") {
                tag("thead") { tag("tr") { listOf("Fecha", "Quién", "Acción", "Clase", "Detalles").forEach { tag("th") { +it } } } }
                tag("tbody") {
                    log["entries"]!!.jsonArray.map { it.jsonObject }.forEach { e ->
                        tag("tr") {
                            tag("td") { +clock.format(java.time.Instant.parse(e.string("at"))) }
                            tag("td") { +(e.optional("actor") ?: "consola") }
                            tag("td") { +e.string("action") }
                            tag("td") { +(e.optional("className") ?: "") }
                            tag("td") { tag("code") { +e.string("details") } }
                        }
                    }
                }
            }
            log.optional("nextCursor")?.let { cursor ->
                a("/audit?before=$cursor&from=${URLEncoder.encode(q["from"].orEmpty(), UTF_8)}&to=${URLEncoder.encode(q["to"].orEmpty(), UTF_8)}", "class" to "button") { +"Anteriores" }
            }
        }
    }
}
