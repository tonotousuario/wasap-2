package wasap

import kotlinx.serialization.json.*
import java.nio.file.Files
import java.nio.file.Path
import java.time.ZoneId
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLSocket

private fun env(name: String, fallback: String? = null): String = System.getenv(name)?.takeIf { it.isNotBlank() }
    ?: fallback ?: error("Set $name")
private fun secret(name: String): String = System.getenv("${name}_FILE")?.let { Files.readString(Path.of(it)).trimEnd() } ?: env(name)
private fun readPin(): String {
    val console = System.console()
    return if (console != null) {
        val chars = console.readPassword("PIN (6–12 dígitos): ") ?: error("PIN required")
        try {
            String(chars)
        } finally {
            chars.fill('\u0000')
        }
    } else {
        System.err.println("PIN (stdin; usa una terminal interactiva para ocultar la entrada):")
        readlnOrNull() ?: error("PIN required")
    }
}
private fun readSecret(prompt: String, confirm: Boolean): CharArray {
    val console = System.console()
    if (console == null) {
        System.err.println("$prompt (stdin; usa una terminal interactiva para ocultar la entrada):")
        return (readlnOrNull() ?: error("Secret required")).toCharArray()
    }
    val first = console.readPassword("$prompt: ") ?: error("Secret required")
    if (confirm) {
        val second = console.readPassword("Repite la frase: ") ?: error("Secret required")
        if (!first.contentEquals(second)) {
            second.fill('\u0000')
            first.fill('\u0000')
            invalid("Las frases no coinciden")
        }
        second.fill('\u0000')
    }
    return first
}

private fun tlsDirectory() = TlsDirectory(Path.of(env("TLS_DIR", "/var/lib/wasap/tls")))

/** Values of a repeatable `--flag value` option. */
private fun options(args: List<String>, flag: String): List<String> = args.indices.filter { args[it] == flag }.map {
    args.getOrNull(it + 1) ?: invalid("Falta el valor de $flag")
}

private fun certs(args: List<String>) {
    val tls = tlsDirectory()
    when (args.firstOrNull()) {
        "init" -> {
            val passphrase = readSecret("Frase nueva de la CA (mínimo 12 caracteres)", confirm = true)
            try {
                val ca = CertificateAuthority.create(tls, passphrase, args.getOrNull(1) ?: "Wasap Installation CA")
                println("CA creada en ${tls.dir}; huella SHA-256 ${Tls.fingerprint(ca)}")
                println("Guarda una copia offline de la frase: sin ella no se pueden emitir certificados.")
            } finally {
                passphrase.fill('\u0000')
            }
        }

        "import" -> {
            val key = Path.of(args.getOrNull(1) ?: invalid("certs import RUTA_CA_KEY [RUTA_CA_CRT]"))
            val certificate = Path.of(args.getOrNull(2) ?: env("TLS_CA_FILE", "/run/wasap/ca.crt"))
            val passphrase = readSecret("Frase nueva para cifrar la CA (mínimo 12 caracteres)", confirm = true)
            try {
                val ca = CertificateAuthority.import(tls, key, certificate, passphrase)
                println("CA importada y cifrada en ${tls.caKey}; huella SHA-256 ${Tls.fingerprint(ca)}")
                println("Borra la copia en claro de $key de este equipo y guarda una copia offline.")
            } finally {
                passphrase.fill('\u0000')
            }
        }

        "issue" -> {
            val explicit = options(args, "--address")
            val addresses = explicit.ifEmpty { NetworkAddresses.detect(System.getenv("SERVER_PUBLIC_ADDRESSES")) }
            val days = options(args, "--days").lastOrNull()?.let { it.toLongOrNull()?.takeIf { d -> d in 1..825 } ?: invalid("--days debe estar entre 1 y 825") } ?: 365
            val passphrase = readSecret("Frase de la CA", confirm = false)
            try {
                val issued = CertificateAuthority.issue(tls, passphrase, addresses, options(args, "--dns"), days)
                println("Certificado emitido hasta ${issued.notAfter} para ${(issued.addresses + issued.dnsNames).joinToString()}")
                println("El servidor en marcha lo usará en las conexiones nuevas en unos segundos, sin reiniciar.")
            } finally {
                passphrase.fill('\u0000')
            }
        }

        "status" -> println(CertificateStatus.describe(tls))

        else -> invalid("Usa: certs init [NOMBRE] | import RUTA_CA_KEY [RUTA_CA_CRT] | issue [--address IP]... [--dns NOMBRE]... [--days N] | status")
    }
}

fun main(args: Array<String>) {
    try {
        if (args.firstOrNull() == "certs") {
            certs(args.drop(1))
            return
        }
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
        // Validate serve-only settings before touching the database.
        val retention = if (args.firstOrNull() == "admin") 0 else retentionDays(System.getenv("PROCESSED_REQUEST_RETENTION_DAYS"))
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
                        service.resetPin(args[3], readPin())
                        println("PIN actualizado; sesiones anteriores invalidadas")
                    }

                    listOf("users", "logout") -> {
                        require(args.size == 4) { "admin users logout MATRICULA" }
                        println("Sesiones cerradas: ${service.logoutUser(args[3])}")
                    }

                    listOf("users", "list") -> println(json(service.users()))

                    listOf("server", "name") -> {
                        require(args.size == 4) { "admin server name 'Nombre del servidor'" }
                        val identity = service.renameServer(args[3])
                        println("Servidor ${identity.id}: ${identity.name}")
                    }

                    listOf("server", "show") -> service.serverIdentity().let { println("Servidor ${it.id}: ${it.name}") }

                    else -> {
                        require(args.getOrNull(1) == "attendance" && args.size in 3..6) { "admin attendance MATRICULA|* [DESDE YYYY-MM-DD] [HASTA YYYY-MM-DD] [CURSOR]" }
                        val p = obj("from" to args.getOrNull(3), "to" to args.getOrNull(4), "before" to args.getOrNull(5), "limit" to 100)
                        println(service.adminAttendance(args[2].takeUnless { it == "*" }, p))
                    }
                }
            } else {
                require(args.isEmpty() || args.toList() == listOf("serve")) { "Use serve, healthcheck or admin" }
                // A certificate issued into TLS_DIR wins; otherwise the provisioned TLS_KEYSTORE is used.
                val tls = tlsDirectory()
                val (keystore, keystorePassword) = if (tls.hasIssuedCertificate()) {
                    tls.keystore to tls.readKeystorePassword()
                } else {
                    Path.of(env("TLS_KEYSTORE", "/run/wasap/server.p12")) to secret("TLS_KEYSTORE_PASSWORD")
                }
                val serverTls = ReloadableServerTls(keystore, keystorePassword)
                val context = serverTls.context
                val watcher = CertificateWatcher(tls, serverTls)
                val sessions = Sessions(DatabaseSessionStore(db))
                val ca = Tls.caFromKeystore(keystore, keystorePassword)
                    ?: System.getenv("TLS_CA_FILE")?.let { Tls.readCertificate(Path.of(it)) }
                val server = TcpServer(service, db, context, env("SERVER_HOST", "0.0.0.0"), env("SERVER_PORT", "5050").toInt(), sessions, ca)
                val maintenance = Maintenance()
                maintenance.every(1, TimeUnit.HOURS, "processed request purge") { service.purgeProcessedRequests(retention) }
                maintenance.every(1, TimeUnit.HOURS, "expired session purge") { sessions.purgeExpired() }
                maintenance.every(10, TimeUnit.SECONDS, "certificate reload") {
                    if (watcher.check()) println("TLS certificate reloaded from ${tls.keystore}")
                }
                maintenance.every(24, TimeUnit.HOURS, "certificate expiry check") {
                    Tls.expiryWarning(Tls.earliestExpiry(serverTls.keystore, serverTls.password))?.let(System.err::println)
                }
                val stop = CountDownLatch(1)
                Runtime.getRuntime().addShutdownHook(
                    Thread {
                        maintenance.close()
                        server.close()
                        stop.countDown()
                    },
                )
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
