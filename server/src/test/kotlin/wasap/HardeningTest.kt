package wasap

import kotlinx.serialization.json.*
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import java.util.UUID
import kotlin.test.*

/** Integration tests for harden-server-load-resilience over real TLS sockets and PostgreSQL. */
@Tag("integration")
class HardeningTest {
    private lateinit var env: TestServer
    private val general = "00000000-0000-4000-8000-000000000001"

    @BeforeEach fun setup() {
        env = TestServer()
        env.service.createUser("A001", "Ana", "123456")
        env.service.createUser("B001", "Beto", "654321")
        env.service.createUser("C001", "Caro", "111111")
    }

    @AfterEach fun cleanup() {
        if (::env.isInitialized) env.close()
    }

    @Test fun `deterministic database failures answer INTERNAL instead of UNAVAILABLE`() {
        env.connect().use { a ->
            a.login("A001", "123456")
            // PostgreSQL jsonb rejects \u0000 when the request payload is stored for idempotency.
            val payload = obj("conversationId" to general, "text" to "hola", "extra" to "a\u0000b")
            val reply = a.request("messages.send", payload)
            assertEquals("error", reply.string("type"))
            val error = reply["payload"]!!.jsonObject
            assertEquals("INTERNAL", error.string("code"))
            assertFalse(error.string("message").contains("Unicode", ignoreCase = true), "no database text leaks")
            assertTrue(a.ok("messages.list", obj("conversationId" to general))["messages"]!!.jsonArray.isEmpty(), "nothing was committed")
        }
    }

    @Test fun `pin reset revokes live sessions within the revalidation window`() {
        var clock = 0L
        TestServer(clock = { clock }).use { server ->
            server.service.createUser("A001", "Ana", "123456")
            server.connect().use { a ->
                val token = a.login("A001", "123456").string("token")
                server.service.resetPin("A001", "121212")
                clock += java.util.concurrent.TimeUnit.SECONDS.toNanos(6)
                assertEquals("UNAUTHENTICATED", a.errorCode("attendance.state"))
                assertEquals("UNAUTHENTICATED", a.errorCode("attendance.state"), "the session is gone, not just rejected once")
                assertEquals("UNAUTHENTICATED", a.errorCode("auth.resume", obj("token" to token)))
            }
            server.connect().use { b ->
                val token = b.login("A001", "121212").string("token")
                server.service.resetPin("A001", "343434")
                // Resuming a stored token always rechecks the database, even inside the window.
                server.connect().use { other -> assertEquals("UNAUTHENTICATED", other.errorCode("auth.resume", obj("token" to token))) }
            }
        }
    }

    @Test fun `only failed logins count towards the account limit`() {
        env.connect().use { a ->
            repeat(6) { a.login("A001", "123456") }
            assertEquals(0, env.server.limiter.size(), "successful logins leave no window")
            repeat(5) { assertEquals("INVALID_CREDENTIALS", a.errorCode("auth.login", obj("matricula" to "a001", "pin" to "000000"))) }
            assertEquals("RATE_LIMITED", a.errorCode("auth.login", obj("matricula" to "A001", "pin" to "123456")))
            a.login("B001", "654321") // another account on the same IP is still allowed
        }
    }

    @Test fun `clients that stop reading do not stall other senders or the database pool`() {
        // Tiny receive buffers so their TLS writes block quickly; they never read again.
        val slow = (1..2).map { env.connect(receiveBuffer = 4096).also { it.login("C001", "111111") } }
        try {
            env.connect().use { sender ->
                sender.login("A001", "123456")
                val text = "界".repeat(4000) // ~12 KB per frame; 400 frames exceed kernel buffers
                var slowest = 0L
                repeat(400) { index ->
                    val started = System.nanoTime()
                    sender.ok("messages.send", obj("conversationId" to general, "text" to text))
                    slowest = maxOf(slowest, System.nanoTime() - started)
                    sender.events.clear()
                    if (index % 100 == 99) {
                        // A fresh unauthenticated socket: new connections and the database still answer.
                        val pingStarted = System.nanoTime()
                        env.connect().use { probe -> assertTrue(probe.ok("ping")["ready"]!!.jsonPrimitive.boolean) }
                        assertTrue(System.nanoTime() - pingStarted < 2_000_000_000L, "ping stalled")
                    }
                }
                assertTrue(slowest < 2_000_000_000L, "a send took ${slowest / 1_000_000} ms")
            }
        } finally {
            slow.forEach { it.close() }
        }
    }

    @Test fun `removed member never receives later messages of the group`() {
        env.connect().use { a ->
            env.connect().use { b ->
                a.login("A001", "123456")
                b.login("B001", "654321")
                val group = a.ok("groups.create", obj("name" to "Clase", "matriculas" to listOf("B001")))["conversation"]!!.jsonObject.string("id")
                a.ok("messages.send", obj("conversationId" to group, "text" to "antes"))
                a.ok("ping") // barrier: the sender finished routing its events
                assertTrue("message.created" in b.drain())
                b.events.clear()
                a.ok("groups.remove", obj("conversationId" to group, "matricula" to "B001"))
                a.ok("messages.send", obj("conversationId" to group, "text" to "después"))
                a.ok("ping")
                assertFalse("message.created" in b.drain(), "verification after the removal commit drops the frame")
            }
        }
    }

    @Test fun `a warm audience follows membership commits made by another database writer`() {
        env.connect().use { a ->
            env.connect().use { b ->
                val owner = a.login("A001", "123456")["user"]!!.jsonObject.string("id")
                val member = b.login("B001", "654321")["user"]!!.jsonObject.string("id")
                val group = a.ok("groups.create", obj("name" to "Redes", "matriculas" to listOf("B001")))["conversation"]!!.jsonObject.string("id")
                assertEquals(setOf(owner, member), env.service.messageAudience(group))
                assertEquals(setOf(owner, member), env.service.messageAudience(group))

                assertFailsWith<IllegalStateException> {
                    env.db.transaction { c ->
                        c.exec("DELETE FROM conversation_members WHERE conversation_id=?::uuid AND user_id=?::uuid", group, member)
                        error("rollback")
                    }
                }
                assertEquals(setOf(owner, member), env.service.messageAudience(group))
                env.db.transaction { c ->
                    val schema = c.rows("SELECT current_schema() AS schema").single().string("schema")
                    c.exec("SET LOCAL search_path TO pg_catalog")
                    c.exec("DELETE FROM $schema.conversation_members WHERE conversation_id=?::uuid AND user_id=?::uuid", group, member)
                }
                assertEquals(setOf(owner), env.service.messageAudience(group))

                a.ok("messages.send", obj("conversationId" to group, "text" to "Sin acceso"))
                a.ok("ping")
                assertFalse("message.created" in b.drain())
                b.events.clear()

                env.db.transaction { c -> c.exec("INSERT INTO conversation_members(conversation_id,user_id) VALUES (?::uuid,?::uuid)", group, member) }
                a.ok("messages.send", obj("conversationId" to group, "text" to "Acceso restaurado"))
                a.ok("ping")
                assertTrue("message.created" in b.drain())
            }
        }
    }

    @Test fun `conversations changed reaches only affected users`() {
        env.connect().use { a ->
            env.connect().use { b ->
                env.connect().use { c ->
                    a.login("A001", "123456")
                    b.login("B001", "654321")
                    c.login("C001", "111111")
                    fun changedFor(vararg clients: TestServer.Client) = clients.map { client ->
                        val seen = "conversations.changed" in client.drain()
                        client.events.clear()
                        seen
                    }
                    val group = a.ok("groups.create", obj("name" to "Clase", "matriculas" to listOf("B001")))["conversation"]!!.jsonObject.string("id")
                    a.ok("ping") // barrier: the sender finished routing its events
                    assertEquals(listOf(true, true, false), changedFor(a, b, c), "create: members only")

                    a.ok("groups.add", obj("conversationId" to group, "matricula" to "C001"))
                    a.ok("ping")
                    assertEquals(listOf(true, true, true), changedFor(a, b, c), "add: the new member too")

                    a.ok("groups.remove", obj("conversationId" to group, "matricula" to "B001"))
                    a.ok("ping")
                    assertEquals(listOf(true, true, true), changedFor(a, b, c), "remove: the removed member is told")

                    a.ok("groups.remove", obj("conversationId" to group, "matricula" to "C001"))
                    a.ok("ping")
                    assertEquals(listOf(true, false, true), changedFor(a, b, c), "remove: B already left, C is told")

                    b.ok("conversations.direct", obj("matricula" to "A001"))
                    b.ok("ping")
                    assertEquals(listOf(true, true, false), changedFor(a, b, c), "direct: both participants, nobody else")
                }
            }
        }
    }

    @Test fun `directory search needs a session`() {
        env.connect().use { c ->
            assertEquals("UNAUTHENTICATED", c.errorCode("users.list", obj("query" to "beto")))
            c.login("A001", "123456")
            assertEquals("VALIDATION", c.errorCode("users.list"))
            assertEquals(1, c.ok("users.list", obj("query" to "beto"))["users"]!!.jsonArray.size)
        }
    }
}
