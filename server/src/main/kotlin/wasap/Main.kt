package wasap

import java.nio.file.Files
import java.nio.file.Path
import java.time.ZoneId
import java.util.UUID
import java.util.concurrent.CountDownLatch
import javax.net.ssl.SSLSocket
import kotlinx.serialization.json.*

private fun env(name: String, fallback: String? = null): String = System.getenv(name)?.takeIf { it.isNotBlank() }
    ?: fallback ?: error("Set $name")
private fun secret(name: String): String = System.getenv("${name}_FILE")?.let { Files.readString(Path.of(it)).trimEnd() } ?: env(name)
private fun readPin(): String {
    val console = System.console()
    return if (console != null) {
        val chars = console.readPassword("PIN (6–12 dígitos): ") ?: error("PIN required")
        try { String(chars) } finally { chars.fill('\u0000') }
    } else {
        System.err.println("PIN (stdin; usa una terminal interactiva para ocultar la entrada):")
        readlnOrNull() ?: error("PIN required")
    }
}
fun main(args: Array<String>) {
    try {
        if (args.firstOrNull() == "healthcheck") {
            val context = Tls.clientContext(Path.of(env("TLS_CA_FILE", "/run/wasap/ca.crt")))
            (context.socketFactory.createSocket(env("HEALTH_HOST", "127.0.0.1"), env("SERVER_PORT", "5050").toInt()) as SSLSocket).use { socket ->
                socket.soTimeout = 5000
                socket.sslParameters = socket.sslParameters.apply { endpointIdentificationAlgorithm = "HTTPS" }
                socket.startHandshake()
                Frames.write(socket.outputStream, obj("v" to 1, "kind" to "request", "id" to UUID.randomUUID(), "type" to "ping", "payload" to obj()))
                val reply = Frames.read(socket.inputStream) ?: error("No health response")
                check(reply.string("type") == "success" && reply["payload"]!!.jsonObject["ready"]!!.jsonPrimitive.boolean)
            }
            return
        }
        Database(env("DB_URL"), env("DB_USER"), secret("DB_PASSWORD"), env("DB_SCHEMA", "public"), env("DB_ALLOW_INSECURE", "false") == "true").use { db ->
            val service = Service(db, ZoneId.of(env("APP_TIMEZONE", "America/Mexico_City")))
            if (args.firstOrNull() == "admin") {
                when (args.drop(1).take(2)) {
                    listOf("users", "add") -> {
                        require(args.size == 5) { "admin users add MATRICULA 'Nombre completo'" }
                        println(service.createUser(args[3], args[4], readPin()).toJson())
                    }
                    listOf("users", "reset-pin") -> {
                        require(args.size == 4) { "admin users reset-pin MATRICULA" }
                        service.resetPin(args[3], readPin()); println("PIN actualizado; sesiones anteriores invalidadas")
                    }
                    listOf("users", "list") -> println(json(service.users()))
                    else -> {
                        require(args.getOrNull(1) == "attendance" && args.size in 3..6) { "admin attendance MATRICULA|* [DESDE YYYY-MM-DD] [HASTA YYYY-MM-DD] [CURSOR]" }
                        val p = obj("from" to args.getOrNull(3), "to" to args.getOrNull(4), "before" to args.getOrNull(5), "limit" to 100)
                        println(service.adminAttendance(args[2].takeUnless { it == "*" }, p))
                    }
                }
            } else {
                require(args.isEmpty() || args.toList() == listOf("serve")) { "Use serve, healthcheck or admin" }
                val context = Tls.serverContext(Path.of(env("TLS_KEYSTORE", "/run/wasap/server.p12")), secret("TLS_KEYSTORE_PASSWORD"))
                val server = TcpServer(service, db, context, env("SERVER_HOST", "0.0.0.0"), env("SERVER_PORT", "5050").toInt())
                val stop = CountDownLatch(1)
                Runtime.getRuntime().addShutdownHook(Thread { server.close(); stop.countDown() })
                server.start()
                println("WASAP TLS/TCP listening on port ${server.port}; database ready")
                stop.await()
            }
        }
    } catch (e: Exception) {
        // Never print exception payloads which can contain database URLs or credentials.
        System.err.println(if (e is ApiError) "${e.code}: ${e.message}" else "Startup/command failed (${e.javaClass.simpleName}); check configuration and connectivity")
        kotlin.system.exitProcess(1)
    }
}
