package wasap

import kotlinx.serialization.json.*
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import java.net.URI
import java.net.URLDecoder
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import kotlin.test.*

/** Invitations and self sign-up over real TLS sockets and PostgreSQL (onboarding-invitations). */
@Tag("integration")
class OnboardingTest {
    private lateinit var env: TestServer
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
            it.ok("groups.create", obj("name" to "Redes", "matriculas" to emptyList<String>(), "class" to true))["conversation"]!!.jsonObject.string("id")
        }
    }

    @AfterEach fun cleanup() {
        if (::env.isInitialized) env.close()
    }

    private fun param(link: String, key: String) = URI(link).rawQuery.split("&").map { it.split("=", limit = 2) }.single { it[0] == key }[1].let { URLDecoder.decode(it, Charsets.UTF_8) }
    private fun invite(as_: String, pin: String, payload: JsonObject) = env.connect().use {
        it.login(as_, pin)
        it.ok("invites.create", payload)
    }

    @Test fun `who may invite whom`() {
        env.connect().use { teacher ->
            teacher.login("PROF1", "222222")
            val created = teacher.ok("invites.create", obj("matricula" to "b001", "name" to "Beto", "classId" to redes))
            assertEquals("B001", created["invitation"]!!.jsonObject.string("matricula"))
            assertEquals(26, created.string("code").length)
            val link = created.string("link")
            assertTrue(link.startsWith("wasap://invite?v=1&"))
            assertEquals(created.string("code"), param(link, "code"))
            assertEquals(env.service.serverIdentity().id, param(link, "id"))
            assertEquals("FORBIDDEN", teacher.errorCode("invites.create", obj("matricula" to "C001", "name" to "Caro")), "a teacher invites to a class")
            assertEquals("CONFLICT", teacher.errorCode("invites.create", obj("matricula" to "A001", "name" to "Ana", "classId" to redes)), "never an existing account")
        }
        env.connect().use { other ->
            other.login("PROF2", "333333")
            assertEquals("FORBIDDEN", other.errorCode("invites.create", obj("matricula" to "C001", "name" to "Caro", "classId" to redes)))
        }
        env.connect().use { student ->
            student.login("A001", "123456")
            assertEquals("FORBIDDEN", student.errorCode("invites.create", obj("matricula" to "C001", "name" to "Caro", "classId" to redes)))
        }
        env.connect().use { admin ->
            admin.login("ADM", "111111")
            admin.ok("invites.create", obj("matricula" to "C001", "name" to "Caro"))
            admin.ok("invites.create", obj("matricula" to "A001", "name" to "Ana", "days" to 1))
            assertEquals("VALIDATION", admin.errorCode("invites.create", obj("matricula" to "D001", "name" to "Dani", "days" to 31)))
        }
    }

    @Test fun `a CSV of 30 students yields 30 invitations and no code is stored in clear`() {
        val csv = "matricula,nombre\n" + (1..30).joinToString("\n") { "S%03d,Estudiante %d".format(it, it) }
        val created = env.connect().use {
            it.login("PROF1", "222222")
            it.ok("invites.import", obj("classId" to redes, "csv" to csv))
        }["invitations"]!!.jsonArray.map { it.jsonObject }
        assertEquals(30, created.size)
        assertEquals(30, created.map { it.string("code") }.toSet().size)
        assertTrue(created.all { it.string("link").startsWith("wasap://invite?") })
        val dump = env.db.transaction { c -> c.rows("SELECT * FROM invitations").toString() + c.rows("SELECT * FROM processed_requests").toString() }
        assertTrue(created.none { dump.contains(it.string("code")) }, "only hashes reach the database")
        env.connect().use {
            it.login("PROF1", "222222")
            assertEquals(30, it.ok("invites.list", obj("classId" to redes))["invitations"]!!.jsonArray.size)
            assertEquals("VALIDATION", it.errorCode("invites.import", obj("classId" to redes, "csv" to "S100,Uno\nS100,Dos")))
        }
    }

    @Test fun `redeeming creates the account in the class and signs in with the chosen PIN`() {
        val code = invite("PROF1", "222222", obj("matricula" to "B001", "name" to "Beto", "classId" to redes)).string("code")
        env.connect().use { phone ->
            assertEquals("VALIDATION", phone.errorCode("invites.redeem", obj("code" to code, "pin" to "12")), "bad PIN does not consume it")
            val session = phone.ok("invites.redeem", obj("code" to code.lowercase(), "pin" to "482915"))
            assertEquals("B001", session["user"]!!.jsonObject.string("matricula"))
            val classes = phone.ok("classes.list")["classes"]!!.jsonArray
            assertEquals(listOf(redes), classes.map { it.jsonObject.string("id") })
        }
        env.connect().use { assertEquals("B001", it.login("B001", "482915")["user"]!!.jsonObject.string("matricula")) }
        env.connect().use { assertEquals("INVITATION_INVALID", it.errorCode("invites.redeem", obj("code" to code, "pin" to "111111"))) }
        env.connect().use { it.login("B001", "482915") } // the reuse attempt changed nothing
    }

    @Test fun `used, expired, revoked and unknown invitations all look the same`() {
        fun fresh(m: String) = invite("PROF1", "222222", obj("matricula" to m, "name" to m, "classId" to redes))
        val used = fresh("U001").string("code").also { env.service.redeemInvitation(it, "123456") }
        val expired = fresh("E001").string("code")
        env.db.transaction { it.exec("UPDATE invitations SET expires_at = now() - interval '1 second' WHERE matricula='E001'") }
        val revoked = fresh("R001")
        env.connect().use {
            it.login("PROF1", "222222")
            it.ok("invites.revoke", obj("id" to revoked["invitation"]!!.jsonObject.string("id")))
        }
        val replies = listOf(used, expired, revoked.string("code"), "ABCDEFGHJKLMNPQRSTUVWXYZ23").map { code ->
            env.connect().use { it.request("invites.redeem", obj("code" to code, "pin" to "123456")) }["payload"]!!.jsonObject
        }
        assertEquals(1, replies.toSet().size, "same code and message: $replies")
        assertEquals("INVITATION_INVALID", replies.first().string("code"))
        assertEquals(0, env.db.transaction { c -> c.rows("SELECT 1 FROM users WHERE matricula IN ('E001','R001')") }.size)
    }

    @Test fun `two simultaneous redemptions create one account`() {
        val code = invite("PROF1", "222222", obj("matricula" to "B001", "name" to "Beto", "classId" to redes)).string("code")
        val start = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(2)
        val outcomes = (1..2).map {
            pool.submit<String> {
                start.await()
                runCatching {
                    env.service.redeemInvitation(code, "48291$it")
                    "ok"
                }.getOrElse { (it as ApiError).code }
            }
        }
        start.countDown()
        assertEquals(listOf("INVITATION_INVALID", "ok"), outcomes.map { it.get() }.sorted())
        pool.shutdown()
        assertEquals(1, env.db.transaction { c -> c.rows("SELECT 1 FROM users WHERE matricula='B001'") }.size)
    }

    @Test fun `an admin invitation resets an existing PIN and a teacher one never takes over an account`() {
        env.connect().use { live ->
            live.login("A001", "123456")
            val code = invite("ADM", "111111", obj("matricula" to "A001", "name" to "Ana")).string("code")
            env.service.redeemInvitation(code, "999999")
            assertEquals(0, env.db.transaction { c -> c.rows("SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.matricula='A001'") }.size, "old sessions end")
        }
        env.connect().use { assertEquals("INVALID_CREDENTIALS", it.errorCode("auth.login", obj("matricula" to "A001", "pin" to "123456"))) }
        // A teacher's invitation for a matrícula that got an account meanwhile is refused and kept.
        val code = invite("PROF1", "222222", obj("matricula" to "N001", "name" to "Nadia", "classId" to redes)).string("code")
        env.service.createUser("N001", "Nadia", "555555")
        assertEquals("CONFLICT", assertFailsWith<ApiError> { env.service.redeemInvitation(code, "777777") }.code)
        env.connect().use { it.login("N001", "555555") }
    }

    @Test fun `self sign-up waits for the class owner, who is told about it`() {
        val code = env.connect().use {
            it.login("PROF1", "222222")
            it.ok("classes.code", obj("classId" to redes))
        }
        assertEquals(8, code.string("code").length)
        assertTrue(code.string("link").startsWith("wasap://signup?"))
        assertEquals("Redes", param(code.string("link"), "class"))
        env.connect().use { teacher ->
            teacher.login("PROF1", "222222")
            assertEquals(code.string("code"), teacher.ok("classes.code", obj("classId" to redes)).string("code"), "stable until renewed")
            env.connect().use { phone ->
                assertEquals("pending", phone.ok("signup.request", obj("classCode" to code.string("code").lowercase(), "matricula" to "s001", "name" to "Sofía", "pin" to "246810")).string("status"))
            }
            assertTrue("signup.changed" in teacher.drain())
            val pending = teacher.ok("signup.list", obj("classId" to redes))["requests"]!!.jsonArray.map { it.jsonObject }
            assertEquals(listOf("S001"), pending.map { it.string("matricula") })
        }
        env.connect().use {
            assertEquals("PENDING_APPROVAL", it.errorCode("auth.login", obj("matricula" to "S001", "pin" to "246810")))
            assertEquals("INVALID_CREDENTIALS", it.errorCode("auth.login", obj("matricula" to "S001", "pin" to "000000")), "the state is only revealed with the right PIN")
        }
        env.connect().use { student ->
            student.login("A001", "123456")
            assertTrue(student.ok("users.list", obj("query" to "sofía"))["users"]!!.jsonArray.isEmpty(), "pending accounts are not in the directory")
            assertEquals("FORBIDDEN", student.errorCode("signup.approve", obj("matricula" to "S001")))
        }
        env.connect().use { other ->
            other.login("PROF2", "333333")
            assertEquals("FORBIDDEN", other.errorCode("signup.approve", obj("matricula" to "S001")))
        }
        env.connect().use {
            it.login("PROF1", "222222")
            it.ok("signup.approve", obj("matricula" to "S001"))
        }
        env.connect().use { phone ->
            phone.login("S001", "246810")
            assertEquals(listOf(redes), phone.ok("classes.list")["classes"]!!.jsonArray.map { it.jsonObject.string("id") })
        }
        env.connect().use { assertEquals("CONFLICT", it.errorCode("signup.request", obj("classCode" to code.string("code"), "matricula" to "S001", "name" to "Otra", "pin" to "111111"))) }
    }

    @Test fun `renewing the code invalidates the old one, rejecting deletes, and 20 pending is the cap`() {
        val (old, renewed) = env.connect().use {
            it.login("PROF1", "222222")
            it.ok("classes.code", obj("classId" to redes)).string("code") to it.ok("classes.code", obj("classId" to redes, "renew" to true)).string("code")
        }
        assertNotEquals(old, renewed)
        env.connect().use { assertEquals("INVITATION_INVALID", it.errorCode("signup.request", obj("classCode" to old, "matricula" to "X001", "name" to "X", "pin" to "123456"))) }
        (1..20).forEach { env.service.requestSignup(renewed, "P%03d".format(it), "Pendiente $it", "123456") }
        env.connect().use { assertEquals("RATE_LIMITED", it.errorCode("signup.request", obj("classCode" to renewed, "matricula" to "P021", "name" to "Una más", "pin" to "123456"))) }
        env.connect().use {
            it.login("PROF1", "222222")
            it.ok("signup.reject", obj("matricula" to "P001"))
        }
        assertEquals(0, env.db.transaction { c -> c.rows("SELECT 1 FROM users WHERE matricula='P001'") }.size)
        env.service.requestSignup(renewed, "P021", "Ahora sí", "123456")
        env.service.adminDecideSignup("P021", approve = true)
        env.connect().use { it.login("P021", "123456") }
    }

    @Test fun `codes are redeemed only by their hash, and the request id cannot replay them`() {
        val id = UUID.randomUUID().toString()
        env.connect().use { teacher ->
            teacher.login("PROF1", "222222")
            val first = teacher.ok("invites.create", obj("matricula" to "B001", "name" to "Beto", "classId" to redes), id)
            val again = teacher.ok("invites.create", obj("matricula" to "B001", "name" to "Beto", "classId" to redes), id)
            assertNotEquals(first.string("code"), again.string("code"), "not replayed from storage: a retry makes a new code")
        }
    }
}
