package wasap

import kotlinx.serialization.json.*
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.file.Files
import java.nio.file.Path
import java.security.cert.X509Certificate
import java.util.UUID
import javax.net.ssl.SSLSocket
import kotlin.test.*

/** A tiny browser: keeps the session cookie and reads the CSRF token from each page. */
class Browser(private val port: Int, ca: Path) {
    private val client = HttpClient.newBuilder().sslContext(Tls.clientContext(ca)).followRedirects(HttpClient.Redirect.NEVER).build()
    private val cookies = mutableMapOf<String, String>()
    var csrf: String? = null

    private fun remember(response: HttpResponse<String>) {
        response.headers().allValues("Set-Cookie").forEach { header ->
            val (name, value) = header.substringBefore(';').split('=', limit = 2)
            if (value.isEmpty()) cookies.remove(name) else cookies[name] = value
        }
        Regex("name=\"csrf\" value=\"([^\"]+)\"").find(response.body())?.let { csrf = it.groupValues[1] }
    }

    private fun request(path: String) = HttpRequest.newBuilder(URI("https://127.0.0.1:$port$path")).also { b ->
        if (cookies.isNotEmpty()) b.header("Cookie", cookies.entries.joinToString("; ") { "${it.key}=${it.value}" })
    }

    fun get(path: String): HttpResponse<String> = client.send(request(path).GET().build(), HttpResponse.BodyHandlers.ofString()).also(::remember)

    fun post(path: String, form: Map<String, String>, withCsrf: Boolean = true): HttpResponse<String> {
        val fields = if (withCsrf && csrf != null) form + ("csrf" to csrf!!) else form
        val body = fields.entries.joinToString("&") { URLEncoder.encode(it.key, Charsets.UTF_8) + "=" + URLEncoder.encode(it.value, Charsets.UTF_8) }
        return client.send(
            request(path).header("Content-Type", "application/x-www-form-urlencoded").POST(HttpRequest.BodyPublishers.ofString(body)).build(),
            HttpResponse.BodyHandlers.ofString(),
        ).also(::remember)
    }

    fun login(matricula: String, pin: String): HttpResponse<String> {
        get("/login")
        return post("/login", mapOf("matricula" to matricula, "pin" to pin)).also { if (it.statusCode() == 303) get("/") }
    }
}

/** The HTTPS admin panel over real TLS and PostgreSQL (admin-web-panel). */
@Tag("integration")
class PanelTest {
    private lateinit var env: TestServer
    private lateinit var panel: PanelServer
    private lateinit var redes: String

    @BeforeEach fun setup() {
        env = TestServer()
        env.service.createUser("ADM", "Administración", "111111")
        env.service.createUser("PROF1", "Profesora Redes", "222222")
        env.service.createUser("PROF2", "Otro profesor", "333333")
        env.service.createUser("A001", "Ana", "123456")
        env.service.setRole("ADM", "admin")
        env.service.setRole("PROF1", "teacher")
        env.service.setRole("PROF2", "teacher")
        redes = env.connect().use {
            it.login("PROF1", "222222")
            it.ok("groups.create", obj("name" to "Redes", "matriculas" to listOf("A001"), "class" to true))["conversation"]!!.jsonObject.string("id")
        }
        val ca = Tls.readCertificate(env.certs.resolve("ca.crt"))
        panel = PanelServer(env.service, env.db, env.tls.context, "127.0.0.1", 0, env.server.limiter, EnrollmentLinks({ listOf("127.0.0.1:5050") }, ca, env.service::serverIdentity))
        panel.start()
    }

    @AfterEach fun cleanup() {
        if (::panel.isInitialized) panel.close()
        if (::env.isInitialized) env.close()
    }

    private fun browser() = Browser(panel.port, env.certs.resolve("ca.crt"))
    private fun panelSessions() = env.db.transaction { c -> c.rows("SELECT 1 FROM panel_sessions") }.size

    @Test fun `the browser favicon request does not refresh the login form cookie`() {
        val browser = browser()
        browser.get("/login")
        val favicon = browser.get("/favicon.ico")
        assertEquals(204, favicon.statusCode())
        assertTrue(favicon.headers().allValues("Set-Cookie").isEmpty())
        assertEquals(303, browser.post("/login", mapOf("matricula" to "ADM", "pin" to "111111")).statusCode())
    }

    @Test fun `every page carries the security headers and only HTTPS answers`() {
        val response = browser().get("/login")
        assertEquals(200, response.statusCode())
        val csp = response.headers().firstValue("Content-Security-Policy").get()
        assertTrue("script-src" !in csp && csp.startsWith("default-src 'none'"), csp)
        assertEquals("DENY", response.headers().firstValue("X-Frame-Options").get())
        assertEquals("no-referrer", response.headers().firstValue("Referrer-Policy").get())
        assertTrue(response.headers().allValues("Set-Cookie").single().contains("Secure; HttpOnly; SameSite=Strict"))
        assertFails {
            java.net.Socket("127.0.0.1", panel.port).use { s ->
                s.getOutputStream().write("GET / HTTP/1.1\r\nHost: x\r\n\r\n".toByteArray())
                s.soTimeout = 2000
                check(String(s.getInputStream().readNBytes(12)).startsWith("HTTP"))
            }
        }
    }

    @Test fun `PANEL_ENABLED=false turns it off and anything else keeps it on`() {
        assertFalse(panelEnabled("false"))
        assertFalse(panelEnabled(" FALSE "))
        assertTrue(panelEnabled(null))
        assertTrue(panelEnabled("true"))
    }

    @Test fun `students are refused without a session and wrong PINs count against the limiter`() {
        val student = browser().login("A001", "123456")
        assertEquals(403, student.statusCode())
        assertTrue(student.body().contains("Acceso denegado"))
        assertEquals(0, panelSessions())
        assertEquals(401, browser().login("PROF1", "999999").statusCode())
        val teacher = browser()
        assertEquals(303, teacher.login("PROF1", "222222").statusCode())
        assertEquals(1, panelSessions())
    }

    @Test fun `a POST without the session's CSRF token changes nothing`() {
        val admin = browser().also { it.login("ADM", "111111") }
        admin.get("/users")
        assertEquals(403, admin.post("/users/role", mapOf("matricula" to "A001", "role" to "admin"), withCsrf = false).statusCode())
        assertEquals(403, admin.post("/users/role", mapOf("matricula" to "A001", "role" to "admin", "csrf" to "otro"), withCsrf = false).statusCode())
        assertEquals("student", env.db.transaction { c -> c.rows("SELECT role FROM users WHERE matricula='A001'") }.single().string("role"))
        val login = browser()
        login.get("/login")
        assertEquals(403, login.post("/login", mapOf("matricula" to "ADM", "pin" to "111111", "csrf" to "x"), withCsrf = false).statusCode(), "login form needs its token too")
    }

    @Test fun `sessions end after 8 hours, 30 idle minutes or losing the role`() {
        fun expired(update: String): Boolean {
            val b = browser().also { it.login("PROF1", "222222") }
            env.db.transaction { it.exec("UPDATE panel_sessions SET $update") }
            return b.get("/").let { it.statusCode() == 303 && it.headers().firstValue("Location").get() == "/login" }
        }
        assertTrue(expired("created_at = now() - interval '8 hours 1 minute'"))
        assertTrue(expired("last_seen_at = now() - interval '31 minutes'"))
        val b = browser().also { it.login("PROF1", "222222") }
        assertEquals(200, b.get("/").statusCode())
        env.service.setRole("PROF1", "student")
        assertEquals(303, b.get("/").statusCode(), "a demoted teacher is out on the next request")
    }

    @Test fun `user data is shown literally`() {
        env.service.createUser("X001", "<script>alert(1)</script>", "123456")
        val page = browser().also { it.login("ADM", "111111") }.get("/users?q=X001").body()
        assertFalse(page.contains("<script>alert(1)</script>"))
        assertTrue(page.contains("&lt;script&gt;alert(1)&lt;/script&gt;"))
    }

    @Test fun `admin manages users and the server name, and each action is audited without secrets`() {
        val admin = browser().also { it.login("ADM", "111111") }
        admin.get("/users")
        assertEquals(303, admin.post("/users/add", mapOf("matricula" to "N001", "name" to "Nadia", "pin" to "246810", "pin2" to "246810")).statusCode())
        admin.post("/users/role", mapOf("matricula" to "N001", "role" to "teacher"))
        env.connect().use { it.login("N001", "246810") }
        admin.post("/users/pin", mapOf("matricula" to "N001", "pin" to "135791"))
        assertEquals("INVALID_CREDENTIALS", assertFailsWith<ApiError> { env.service.authenticate("N001", "246810") }.code)
        env.connect().use { it.login("N001", "135791") }
        admin.post("/users/logout", mapOf("matricula" to "N001"))
        assertEquals(0, env.db.transaction { c -> c.rows("SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.matricula='N001'") }.size)
        admin.get("/server")
        admin.post("/server/name", mapOf("name" to "Aula 5"))
        assertEquals("Aula 5", env.service.serverIdentity().name)
        val audit = env.db.transaction { c -> c.rows("SELECT action, details::text AS d, actor_id::text AS a FROM audit_log ORDER BY id") }
        assertEquals(listOf("user.create", "user.role", "user.pin_reset", "user.logout", "server.rename"), audit.map { it.string("action") }.filter { it != "class.code_create" }.takeLast(5))
        val dump = audit.toString()
        assertFalse(dump.contains("246810") || dump.contains("135791"), "no PIN in the audit log")
        assertTrue(admin.get("/audit").body().contains("user.pin_reset"))
    }

    @Test fun `a teacher only sees their own classes, and others look missing`() {
        val other = browser().also { it.login("PROF2", "333333") }
        assertFalse(other.get("/").body().contains("Redes"))
        assertEquals(404, other.get("/classes/$redes").statusCode())
        assertEquals(404, other.get("/classes/$redes/attendance.csv").statusCode())
        assertEquals(404, other.get("/classes/${UUID.randomUUID()}").statusCode())
        assertEquals(404, other.post("/classes/$redes/code/renew", emptyMap()).statusCode())
        assertEquals(404, other.get("/users").statusCode(), "admin pages too")
        assertEquals(404, other.get("/server").statusCode())
        val owner = browser().also { it.login("PROF1", "222222") }
        assertTrue(owner.get("/").body().contains("Redes"))
        assertEquals(200, owner.get("/classes/$redes").statusCode())
        browser().also { it.login("ADM", "111111") }.get("/classes/$redes").let { assertEquals(200, it.statusCode(), it.body()) }
    }

    @Test fun `teachers invite with printable QR, renew the code and approve sign-ups`() {
        val teacher = browser().also { it.login("PROF1", "222222") }
        val page = teacher.get("/classes/$redes").body()
        val code = Regex("class=\"code\">([A-Z2-9]{8})<").find(page)?.groupValues?.get(1) ?: fail(page.takeLast(1500))
        assertTrue(page.contains("<svg"), "the sign-up QR is drawn")
        val sheet = teacher.post("/classes/$redes/invites", mapOf("csv" to "S001,Sofía\nS002,Saúl", "days" to "3"))
        assertEquals(200, sheet.statusCode())
        assertEquals(2, Regex("class=\"invite\"").findAll(sheet.body()).count())
        assertEquals(2, Regex("<svg").findAll(sheet.body()).count())
        val invite = Regex("<code>([A-Z2-9]{26})</code>").find(sheet.body())!!.groupValues[1]
        env.service.redeemInvitation(invite, "482915")
        env.service.requestSignup(code, "P001", "Paco", "123456")
        teacher.get("/classes/$redes")
        assertEquals(303, teacher.post("/classes/$redes/signups/approve", mapOf("matricula" to "P001")).statusCode())
        env.connect().use { it.login("P001", "123456") }
        teacher.post("/classes/$redes/code/renew", emptyMap())
        assertNotEquals(code, Regex("class=\"code\">([A-Z2-9]{8})<").find(teacher.get("/classes/$redes").body())!!.groupValues[1])
        val members = teacher.get("/classes/$redes").body()
        assertTrue(members.contains("S001") && members.contains("P001"))
        val audit = env.db.transaction { c -> c.rows("SELECT details::text AS d FROM audit_log") }.toString()
        assertFalse(audit.contains(invite) || audit.contains(code), "codes never reach the audit log")
    }

    @Test fun `the class CSV has exactly the movements of the range, in local time`() {
        val ana = env.db.transaction { c -> c.rows("SELECT id::text FROM users WHERE matricula='A001'") }.single().string("id")
        env.db.transaction { c ->
            listOf("2026-10-31T23:00:00Z" to "ENTRY", "2026-11-01T15:00:00Z" to "ENTRY", "2026-11-30T23:30:00Z" to "EXIT", "2026-12-01T06:30:00Z" to "ENTRY").forEach { (at, type) ->
                c.exec("INSERT INTO attendance_events(id,user_id,type,class_id,recorded_at) VALUES (?::uuid,?::uuid,?,?::uuid,?::timestamptz)", UUID.randomUUID().toString(), ana, type, redes, at)
            }
            c.exec("INSERT INTO attendance_events(id,user_id,type,recorded_at) VALUES (?::uuid,?::uuid,'ENTRY','2026-11-10T15:00:00Z')", UUID.randomUUID().toString(), ana)
        }
        val response = browser().also { it.login("PROF1", "222222") }.get("/classes/$redes/attendance.csv?from=2026-11-01&to=2026-11-30")
        assertEquals("text/csv; charset=utf-8", response.headers().firstValue("Content-Type").get())
        assertEquals(
            "matricula,nombre,clase,tipo,instante_local\n" +
                "A001,Ana,Redes,Salida,2026-11-30 17:30:00\n" +
                "A001,Ana,Redes,Entrada,2026-11-01 09:00:00\n",
            response.body(),
        )
        val door = browser().also { it.login("ADM", "111111") }.get("/attendance.csv?from=2026-11-01&to=2026-11-30").body()
        assertEquals("matricula,nombre,clase,tipo,instante_local\nA001,Ana,General,Entrada,2026-11-10 09:00:00\n", door)
        assertEquals(404, browser().also { it.login("PROF1", "222222") }.get("/attendance.csv").statusCode(), "the door is admin only")
    }

    @Test fun `a teacher's audit view shows only their classes`() {
        browser().also { it.login("PROF1", "222222") }.let {
            it.get("/classes/$redes")
            it.post("/classes/$redes/code/renew", emptyMap())
        }
        env.service.setRole("A001", "teacher", actor = null)
        val teacher = browser().also { it.login("PROF1", "222222") }.get("/audit").body()
        assertTrue(teacher.contains("class.code_renew"))
        assertFalse(teacher.contains("user.role"), "global actions are not a teacher's")
        assertTrue(browser().also { it.login("ADM", "111111") }.get("/audit").body().contains("user.role"))
    }
}

/** Certificate issuance from the panel, hot, over a CA directory of its own. */
@Tag("integration")
class PanelCertificatesTest {
    @Test fun `issuing from the panel serves the new certificate at once and audits it without the passphrase`() {
        TestServer().use { env ->
            val dir = Files.createTempDirectory("wasap-panel-ca")
            try {
                val tls = TlsDirectory(dir)
                val passphrase = "frase de la ca del panel"
                CertificateAuthority.create(tls, passphrase.toCharArray())
                CertificateAuthority.issue(tls, passphrase.toCharArray(), listOf("10.9.9.9"))
                val served = ReloadableServerTls(tls.keystore, tls.readKeystorePassword())
                val watcher = CertificateWatcher(tls, served)
                env.service.createUser("ADM", "Administración", "111111")
                env.service.setRole("ADM", "admin")
                PanelServer(env.service, env.db, served.context, "127.0.0.1", 0, LoginLimiter(), certificates = PanelCertificates(tls, { listOf("192.168.1.50") }, { watcher.check() })).use { panel ->
                    panel.start()
                    fun leaf(): X509Certificate = (Tls.clientContext(tls.caCertificate).socketFactory.createSocket("127.0.0.1", panel.port) as SSLSocket).use {
                        it.startHandshake()
                        it.session.peerCertificates[0] as X509Certificate
                    }
                    assertFalse(leaf().subjectAlternativeNames.any { it[1] == "192.168.1.50" })
                    val admin = Browser(panel.port, tls.caCertificate).also { it.login("ADM", "111111") }
                    assertTrue(admin.get("/server").body().contains("192.168.1.50"), "detected addresses are offered")
                    assertEquals(303, admin.post("/server/certs", mapOf("addresses" to "192.168.1.50\n10.8.0.1", "passphrase" to "frase equivocada!!")).statusCode())
                    assertFalse(leaf().subjectAlternativeNames.any { it[1] == "192.168.1.50" }, "a wrong passphrase issues nothing")
                    env.db.transaction { it.exec("ALTER TABLE audit_log ADD CONSTRAINT test_audit_unavailable CHECK (action <> 'cert.issue_requested') NOT VALID") }
                    val blocked = admin.post("/server/certs", mapOf("addresses" to "192.168.1.50", "passphrase" to passphrase))
                    assertEquals(500, blocked.statusCode())
                    assertFalse(leaf().subjectAlternativeNames.any { it[1] == "192.168.1.50" }, "an unaudited request issues nothing")
                    env.db.transaction { it.exec("ALTER TABLE audit_log DROP CONSTRAINT test_audit_unavailable") }
                    val ok = admin.post("/server/certs", mapOf("addresses" to "192.168.1.50\n10.8.0.1", "passphrase" to passphrase))
                    assertTrue(ok.headers().firstValue("Location").get().contains("ok="))
                    assertTrue(leaf().subjectAlternativeNames.any { it[1] == "192.168.1.50" }, "served without restarting")
                    val audit = env.db.transaction { c -> c.rows("SELECT action, details::text AS d FROM audit_log WHERE action='cert.issue'") }
                    assertEquals(1, audit.size)
                    assertTrue(audit.single().string("d").contains("192.168.1.50"))
                    assertFalse(audit.toString().contains(passphrase))
                    val requestAudit = env.db.transaction { it.rows("SELECT action, details::text AS d FROM audit_log WHERE action='cert.issue_requested'") }
                    assertEquals(1, requestAudit.size)
                    assertEquals(audit.single().string("d"), requestAudit.single().string("d"))
                    assertFalse(requestAudit.toString().contains(passphrase))
                }
            } finally {
                dir.toFile().deleteRecursively()
            }
        }
    }
}
