package wasap

import java.security.MessageDigest
import kotlinx.serialization.json.*
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import kotlin.test.*

/** Integration tests for persist-sessions over real TLS sockets and PostgreSQL. */
@Tag("integration")
class SessionPersistenceTest {
    private lateinit var env: TestServer

    @BeforeEach fun setup() {
        env = TestServer()
        env.service.createUser("A001", "Ana", "123456")
    }
    @AfterEach fun cleanup() { if (::env.isInitialized) env.close() }

    private fun sessionRows() = env.db.transaction { c ->
        c.rows("SELECT encode(token_hash,'hex') AS h, user_id::text AS u, credential_version AS v, expires_at AS e FROM sessions")
    }

    @Test fun `sessions survive a server restart`() {
        val token = env.connect().use { it.login("A001", "123456").string("token") }
        env.restart()
        env.connect().use { client ->
            val resumed = client.ok("auth.resume", obj("token" to token))
            assertEquals("A001", resumed["user"]!!.jsonObject.string("matricula"))
            client.ok("attendance.state")
        }
    }

    @Test fun `only the SHA-256 of the token is stored`() {
        val token = env.connect().use { it.login("A001", "123456").string("token") }
        val rows = sessionRows()
        assertEquals(1, rows.size)
        val expected = MessageDigest.getInstance("SHA-256").digest(token.toByteArray()).joinToString("") { "%02x".format(it) }
        assertEquals(expected, rows.single().string("h"))
        val dump = env.db.transaction { c -> c.rows("SELECT * FROM sessions") }.toString()
        assertFalse(dump.contains(token), "the clear-text token never reaches the database")
    }

    @Test fun `a sixth login evicts the session that expires soonest`() {
        val tokens = (1..6).map { env.connect().use { c -> c.login("A001", "123456").string("token") } }
        assertEquals(5, sessionRows().size)
        env.restart() // also clears memory, so only the database decides
        env.connect().use { c ->
            assertEquals("UNAUTHENTICATED", c.errorCode("auth.resume", obj("token" to tokens.first())))
            c.ok("auth.resume", obj("token" to tokens.last()))
        }
    }

    @Test fun `pin reset deletes sessions so resume fails at once and live sockets within 5 seconds`() {
        var clock = 0L
        TestServer(clock = { clock }).use { server ->
            server.service.createUser("B001", "Beto", "654321")
            server.connect().use { live ->
                val token = live.login("B001", "654321").string("token")
                server.service.resetPin("B001", "121212")
                assertTrue(server.db.transaction { c -> c.rows("SELECT 1 FROM sessions") }.isEmpty(), "rows deleted in the reset transaction")
                server.connect().use { other -> assertEquals("UNAUTHENTICATED", other.errorCode("auth.resume", obj("token" to token))) }
                clock += java.util.concurrent.TimeUnit.SECONDS.toNanos(6)
                assertEquals("UNAUTHENTICATED", live.errorCode("attendance.state"))
            }
        }
    }

    @Test fun `admin logout closes every session of a user`() {
        val tokens = (1..2).map { env.connect().use { c -> c.login("A001", "123456").string("token") } }
        assertEquals(2, env.service.logoutUser("a001"))
        assertEquals(0, env.service.logoutUser("A001"), "nothing left to close")
        env.connect().use { c -> tokens.forEach { assertEquals("UNAUTHENTICATED", c.errorCode("auth.resume", obj("token" to it))) } }
        assertEquals("NOT_FOUND", assertFailsWith<ApiError> { env.service.logoutUser("Z999") }.code)
    }

    @Test fun `purge removes expired sessions and keeps live ones`() {
        val live = env.connect().use { it.login("A001", "123456").string("token") }
        val expired = env.connect().use { it.login("A001", "123456").string("token") }
        env.db.transaction { c -> c.exec("UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE token_hash = decode(?,'hex')", tokenHash(expired)) }
        assertEquals(1, DatabaseSessionStore(env.db).purgeExpired())
        assertEquals(listOf(tokenHash(live)), sessionRows().map { it.string("h") })
        env.connect().use { c -> c.ok("auth.resume", obj("token" to live)) }
    }
}
