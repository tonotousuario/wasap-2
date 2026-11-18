package wasap

import kotlinx.serialization.json.*
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import java.security.MessageDigest
import java.util.UUID
import kotlin.test.*

/** Integration tests for server-identity-and-trust over real TLS sockets and PostgreSQL. */
@Tag("integration")
class IdentityTest {
    private lateinit var env: TestServer

    @BeforeEach fun setup() {
        env = TestServer()
    }

    @AfterEach fun cleanup() {
        if (::env.isInitialized) env.close()
    }

    @Test fun `server hello announces a stable identity without a session`() {
        val ca = Tls.readCertificate(env.certs.resolve("ca.crt"))
        val expected = MessageDigest.getInstance("SHA-256").digest(ca.encoded).joinToString("") { "%02x".format(it) }
        val first = env.connect().use { it.ok("server.hello") }
        UUID.fromString(first.string("serverId"))
        assertEquals("Wasap", first.string("name"))
        assertEquals(listOf(1), first["protocolVersions"]!!.jsonArray.map { it.jsonPrimitive.int })
        assertEquals(expected, first.string("caFingerprint"))
        assertEquals(0, env.server.limiter.size(), "hello never counts as a login attempt")
        env.restart()
        val second = env.connect().use { it.ok("server.hello") }
        assertEquals(first, second, "same identity after a restart")
    }

    @Test fun `unknown protocol versions answer the supported ones`() {
        env.connect().use { client ->
            val id = UUID.randomUUID().toString()
            Frames.write(client.socket.outputStream, obj("v" to 2, "kind" to "request", "id" to id, "type" to "ping", "payload" to obj()))
            val reply = Frames.read(client.socket.inputStream)!!
            assertEquals("error", reply.string("type"))
            val payload = reply["payload"]!!.jsonObject
            assertEquals("UNSUPPORTED_VERSION", payload.string("code"))
            assertEquals(listOf(1), payload["supportedVersions"]!!.jsonArray.map { it.jsonPrimitive.int })
            assertEquals("success", client.request("ping").string("type"), "the connection stays usable")
        }
    }
}
