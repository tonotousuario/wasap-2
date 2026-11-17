package wasap

import kotlinx.serialization.json.*
import java.net.InetSocketAddress
import java.nio.file.Files
import java.nio.file.Path
import java.sql.DriverManager
import java.util.UUID
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLSocket
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Disposable TLS server over a random PostgreSQL schema for integration tests. */
class TestServer(private val clock: () -> Long = System::nanoTime) : AutoCloseable {
    private val url = requireNotNull(System.getenv("WASAP_TEST_DB_URL")) { "Set WASAP_TEST_DB_URL to a disposable PostgreSQL database" }
    private val dbUser = System.getenv("WASAP_TEST_DB_USER") ?: "wasap_test"
    private val dbPassword = System.getenv("WASAP_TEST_DB_PASSWORD") ?: "wasap_test"
    private val schema = "test_" + UUID.randomUUID().toString().replace("-", "")
    val certs: Path = Files.createTempDirectory("wasap-tls-test")
    val db: Database
    val service: Service
    lateinit var server: TcpServer
        private set

    init {
        generateCertificates(certs)
        db = Database(url, dbUser, dbPassword, schema, allowInsecure = true)
        service = Service(db)
        start(0)
    }

    private fun start(port: Int) {
        val storePassword = Files.readString(certs.resolve("keystore-password")).trim()
        server = TcpServer(
            service,
            db,
            Tls.serverContext(certs.resolve("server.p12"), storePassword),
            "127.0.0.1",
            port,
            Sessions(DatabaseSessionStore(db), clock),
        )
        server.start()
    }

    /** Simulates a server restart: a new TcpServer with empty memory on the same port and database. */
    fun restart() {
        val port = server.port
        server.close()
        start(port)
    }

    fun connect(receiveBuffer: Int? = null): Client {
        val socket = Tls.clientContext(certs.resolve("ca.crt")).socketFactory.createSocket() as SSLSocket
        receiveBuffer?.let { socket.receiveBufferSize = it }
        socket.connect(InetSocketAddress("127.0.0.1", server.port), 5000)
        socket.soTimeout = 5000
        socket.sslParameters = socket.sslParameters.apply { endpointIdentificationAlgorithm = "HTTPS" }
        socket.startHandshake()
        return Client(socket)
    }

    override fun close() {
        server.close()
        db.close()
        DriverManager.getConnection(url, dbUser, dbPassword).use { c -> c.createStatement().use { it.execute("DROP SCHEMA IF EXISTS $schema CASCADE") } }
        certs.toFile().deleteRecursively()
    }

    class Client(val socket: SSLSocket) : AutoCloseable {
        val events = mutableListOf<JsonObject>()

        /** Sends a request and returns its response; events received meanwhile go to [events]. */
        fun request(type: String, payload: JsonObject = obj(), id: String = UUID.randomUUID().toString()): JsonObject {
            send(type, payload, id)
            while (true) {
                val frame = Frames.read(socket.inputStream) ?: error("Connection closed")
                if (frame.string("kind") == "event") {
                    events.add(frame)
                } else {
                    assertEquals(id, frame.string("id"))
                    return frame
                }
            }
        }
        fun send(type: String, payload: JsonObject = obj(), id: String = UUID.randomUUID().toString()) = Frames.write(socket.outputStream, obj("v" to 1, "kind" to "request", "id" to id, "type" to type, "payload" to payload))
        fun ok(type: String, payload: JsonObject = obj(), id: String = UUID.randomUUID().toString()): JsonObject {
            val reply = request(type, payload, id)
            assertEquals("success", reply.string("type"), reply.toString())
            return reply["payload"]!!.jsonObject
        }
        fun errorCode(type: String, payload: JsonObject = obj(), id: String = UUID.randomUUID().toString()): String {
            val reply = request(type, payload, id)
            assertEquals("error", reply.string("type"), reply.toString())
            return reply["payload"]!!.jsonObject.string("code")
        }
        fun login(matricula: String, pin: String) = ok("auth.login", obj("matricula" to matricula, "pin" to pin))

        /** Collects events already queued for this socket, using a ping as an ordering barrier. */
        fun drain(): List<String> {
            ok("ping")
            return events.map { it.string("type") }
        }
        override fun close() = socket.close()
    }

    companion object {
        fun generateCertificates(dir: Path) {
            val script = ProcessBuilder("bash", "../scripts/create-certs.sh", "127.0.0.1", dir.toString()).redirectErrorStream(true).start()
            val output = script.inputStream.bufferedReader().readText()
            assertTrue(script.waitFor(30, TimeUnit.SECONDS), "certificate generation timed out")
            assertEquals(0, script.exitValue(), output)
        }
    }
}
