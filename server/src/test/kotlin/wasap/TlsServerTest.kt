package wasap

import java.nio.file.Files
import java.sql.DriverManager
import java.util.UUID
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLSocket
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Tag
import kotlin.test.*

@Tag("integration")
class TlsServerTest {
    @Test fun `operators are warned only when the certificate expires within 30 days`() {
        val dir = Files.createTempDirectory("wasap-expiry-test")
        try {
            fun keystore(days: Int): java.nio.file.Path {
                val key = dir.resolve("k$days.pem"); val cert = dir.resolve("c$days.pem"); val store = dir.resolve("s$days.p12")
                fun run(vararg command: String) {
                    val process = ProcessBuilder(*command).redirectErrorStream(true).start()
                    val output = process.inputStream.bufferedReader().readText()
                    assertTrue(process.waitFor(30, TimeUnit.SECONDS)); assertEquals(0, process.exitValue(), output)
                }
                run("openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "$days", "-subj", "/CN=WASAP Test",
                    "-keyout", key.toString(), "-out", cert.toString())
                run("openssl", "pkcs12", "-export", "-name", "wasap", "-inkey", key.toString(), "-in", cert.toString(),
                    "-out", store.toString(), "-passout", "pass:secreto")
                Tls.serverContext(store, "secreto") // still a valid keystore for serving
                return store
            }
            val soon = Tls.expiryWarning(Tls.earliestExpiry(keystore(10), "secreto"))
            assertNotNull(soon)
            assertTrue(soon.contains("expires on") && soon.contains("create-certs.sh"), soon)
            assertNull(Tls.expiryWarning(Tls.earliestExpiry(keystore(200), "secreto")))
        } finally { dir.toFile().deleteRecursively() }
    }

    @Test fun `tls authenticates frames rejects invalid peers and enforces logout and session invalidation`() {
        val url = requireNotNull(System.getenv("WASAP_TEST_DB_URL"))
        val user = System.getenv("WASAP_TEST_DB_USER") ?: "wasap_test"
        val password = System.getenv("WASAP_TEST_DB_PASSWORD") ?: "wasap_test"
        val schema = "test_" + UUID.randomUUID().toString().replace("-", "")
        val dir = Files.createTempDirectory("wasap-tls-test")
        val script = ProcessBuilder("bash", "../scripts/create-certs.sh", "127.0.0.1", dir.toString()).redirectErrorStream(true).start()
        val scriptOutput = script.inputStream.bufferedReader().readText()
        assertTrue(script.waitFor(30, TimeUnit.SECONDS), "certificate generation timed out")
        assertEquals(0, script.exitValue(), scriptOutput)
        val storePassword = Files.readString(dir.resolve("keystore-password")).trim()
        Database(url, user, password, schema, true).use { db ->
            val service = Service(db)
            service.createUser("A001", "Ana", "123456")
            var clock = 0L
            val server = TcpServer(service, db, Tls.serverContext(dir.resolve("server.p12"), storePassword), "127.0.0.1", 0, Sessions(clock = { clock }))
            try {
                server.start()
                fun connect(host: String = "127.0.0.1") = (Tls.clientContext(dir.resolve("ca.crt")).socketFactory.createSocket(host, server.port) as SSLSocket).apply {
                    soTimeout = 5000
                    sslParameters = sslParameters.apply { endpointIdentificationAlgorithm = "HTTPS" }
                    startHandshake()
                }
                val events = mutableListOf<kotlinx.serialization.json.JsonObject>()
                fun request(socket: SSLSocket, type: String, payload: kotlinx.serialization.json.JsonObject = obj(), id: String = UUID.randomUUID().toString()): kotlinx.serialization.json.JsonObject {
                    Frames.write(socket.outputStream, obj("v" to 1, "kind" to "request", "id" to id, "type" to type, "payload" to payload))
                    while (true) {
                        val frame = Frames.read(socket.inputStream)!!
                        if (frame.string("kind") == "event") events.add(frame)
                        else { assertEquals(id, frame.string("id")); return frame }
                    }
                }
                connect().use { socket ->
                    assertEquals("success", request(socket, "ping").string("type"))
                    assertEquals("UNAUTHENTICATED", request(socket, "attendance.state")["payload"]!!.let { it as kotlinx.serialization.json.JsonObject }.string("code"))
                    val login = request(socket, "auth.login", obj("matricula" to "A001", "pin" to "123456"))
                    assertEquals("success", login.string("type"))
                    val token = (login["payload"] as kotlinx.serialization.json.JsonObject).string("token")
                    assertEquals("success", request(socket, "attendance.state").string("type"))
                    val operation = UUID.randomUUID().toString()
                    val firstPayload = request(socket, "attendance.mark", obj("expectedLastEventId" to null), operation)["payload"] as kotlinx.serialization.json.JsonObject
                    val first = firstPayload["event"] as kotlinx.serialization.json.JsonObject
                    val secondPayload = request(socket, "attendance.mark", obj("expectedLastEventId" to first.string("id")))["payload"] as kotlinx.serialization.json.JsonObject
                    val second = secondPayload["event"] as kotlinx.serialization.json.JsonObject
                    request(socket, "attendance.mark", obj("expectedLastEventId" to null), operation)
                    request(socket, "ping") // drain all preceding hints on this ordered connection
                    val latestHint = events.last { it.string("type") == "attendance.changed" }["payload"] as kotlinx.serialization.json.JsonObject
                    assertEquals(second, latestHint["lastEvent"], "replaying an old operation must not regress live attendance")
                    assertEquals("success", request(socket, "auth.logout").string("type"))
                    assertEquals("error", request(socket, "auth.resume", obj("token" to token)).string("type"))
                    request(socket, "auth.login", obj("matricula" to "A001", "pin" to "123456"))
                    service.resetPin("A001", "121212")
                    clock += TimeUnit.SECONDS.toNanos(6) // revocation is bounded by the 5 s revalidation window
                    assertEquals("error", request(socket, "attendance.state").string("type"))
                }
                // The signed certificate intentionally has only IP SANs, not localhost DNS.
                assertFails { connect("localhost").close() }
                assertFails {
                    (javax.net.ssl.SSLContext.getDefault().socketFactory.createSocket("127.0.0.1", server.port) as SSLSocket).use { it.soTimeout = 5000; it.startHandshake() }
                }
            } finally { server.close() }
        }
        DriverManager.getConnection(url, user, password).use { c -> c.createStatement().use { it.execute("DROP SCHEMA $schema CASCADE") } }
        dir.toFile().deleteRecursively()
    }
}
