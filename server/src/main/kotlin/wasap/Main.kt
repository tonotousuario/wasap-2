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
internal const val DEFAULT_DB_POOL_SIZE = 20
internal const val DEFAULT_MAX_CONNECTIONS = 2500
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

/** The keystore the server serves: a certificate issued into TLS_DIR wins over TLS_KEYSTORE. */
private fun servingKeystore(tls: TlsDirectory): Pair<Path, String> = if (tls.hasIssuedCertificate()) {
    tls.keystore to tls.readKeystorePassword()
} else {
    Path.of(env("TLS_KEYSTORE", "/run/wasap/server.p12")) to secret("TLS_KEYSTORE_PASSWORD")
}

/**
 * Links for this server: `--address` values (or the serving certificate's addresses, read on
 * each use so a hot-reloaded certificate is picked up) and the installation CA.
 */
private fun enrollmentLinks(service: Service, args: List<String> = emptyList()): Pair<EnrollmentLinks, java.security.cert.X509Certificate> {
    val tls = tlsDirectory()
    val (keystore, password) = servingKeystore(tls)
    val ca = Tls.caFromKeystore(keystore, password)
        ?: tls.caCertificate.takeIf { Files.exists(it) }?.let(Tls::readCertificate)
        ?: System.getenv("TLS_CA_FILE")?.let { Tls.readCertificate(Path.of(it)) }
        ?: invalid("No se encontró el certificado de la CA")
    val port = env("SERVER_PUBLIC_PORT", env("SERVER_PORT", "5050")).toInt()
    val explicit = options(args, "--address").map { ServerQr.withPort(it, port) }
    val addresses = { explicit.ifEmpty { servingKeystore(tls).let { (k, p) -> ServerQr.defaultHosts(k, p) }.map { ServerQr.address(it, port) } } }
    return EnrollmentLinks(addresses, ca, service::serverIdentity) to ca
}

/** `certs qr`: prints the enrollment link and QR, optionally also as PNG. */
private fun serverQr(service: Service, args: List<String>) {
    val (links, ca) = enrollmentLinks(service, args)
    val link = links.server()
    print(ServerQr.terminal(ServerQr.matrix(link, margin = 2)))
    val identity = service.serverIdentity()
    println("Servidor «${identity.name}» · CA ${Tls.fingerprint(ca).take(23)}…")
    println(link)
    options(args, "--png").lastOrNull()?.let { path ->
        ServerQr.png(ServerQr.matrix(link), Path.of(path))
        println("PNG guardado en $path")
    }
}

/** `admin invites add|import`: prints `matricula,nombre,caduca,enlace` and optionally one PNG each. */
private fun invites(service: Service, args: List<String>) {
    val usage = "admin invites add MATRICULA NOMBRE | import ARCHIVO.csv  [--class ID] [--days N] [--png DIRECTORIO] [--address HOST[:PUERTO]]..."
    val flags = setOf("--class", "--days", "--png", "--address")
    val positional = args.filterIndexed { i, value -> value !in flags && args.getOrNull(i - 1) !in flags }
    val rows = when (positional.firstOrNull()) {
        "add" -> listOf((positional.getOrNull(1) ?: invalid(usage)) to (positional.getOrNull(2) ?: invalid(usage)))
        "import" -> service.parseRoster(Files.readString(Path.of(positional.getOrNull(1) ?: invalid(usage))))
        else -> invalid(usage)
    }
    val days = options(args, "--days").lastOrNull()?.let { it.toIntOrNull() ?: invalid("--days debe ser un número") } ?: 7
    val created = service.adminInvitations(rows, options(args, "--class").lastOrNull(), days)
    val (links, _) = enrollmentLinks(service, args)
    val dir = options(args, "--png").lastOrNull()?.let { Path.of(it).also(Files::createDirectories) }
    println("matricula,nombre,caduca,enlace")
    created.forEach { invitation ->
        val link = links.invite(invitation.code)
        println(listOf(invitation.matricula, "\"${invitation.name.replace("\"", "\"\"")}\"", invitation.expiresAt, link).joinToString(","))
        dir?.let { ServerQr.png(ServerQr.matrix(link), it.resolve("${invitation.matricula}.png")) }
    }
    dir?.let { System.err.println("${created.size} códigos QR en $it") }
}

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

        else -> invalid("Usa: certs init [NOMBRE] | import RUTA_CA_KEY [RUTA_CA_CRT] | issue [--address IP]... [--dns NOMBRE]... [--days N] | status | qr [--address HOST[:PUERTO]]... [--png RUTA]")
    }
}

fun main(args: Array<String>) {
    try {
        if (args.firstOrNull() == "certs" && args.getOrNull(1) != "qr") {
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
        val serving = args.isEmpty() || args.toList() == listOf("serve")
        val retention = if (serving) retentionDays(System.getenv("PROCESSED_REQUEST_RETENTION_DAYS")) else 0
        val poolSize = positiveSetting("DB_POOL_SIZE", System.getenv("DB_POOL_SIZE"), DEFAULT_DB_POOL_SIZE)
        val maxConnections = if (serving) positiveSetting("MAX_CONNECTIONS", System.getenv("MAX_CONNECTIONS"), DEFAULT_MAX_CONNECTIONS) else DEFAULT_MAX_CONNECTIONS
        Database(env("DB_URL"), env("DB_USER"), secret("DB_PASSWORD"), env("DB_SCHEMA", "public"), env("DB_ALLOW_INSECURE", "false") == "true", poolSize).use { db ->
            val service = Service(db, ZoneId.of(env("APP_TIMEZONE", "America/Mexico_City")))
            if (args.firstOrNull() == "certs") {
                serverQr(service, args.drop(2))
            } else if (args.firstOrNull() == "admin" && args.getOrNull(1) == "invites") {
                invites(service, args.drop(2))
            } else if (args.firstOrNull() == "admin" && args.getOrNull(1) == "signups") {
                when (args.getOrNull(2)) {
                    "list", null -> service.adminSignups().forEach { println("${it.string("matricula")}  ${it.string("name")}  · ${it.string("className")}  · ${it.string("createdAt")}") }

                    "approve", "reject" -> {
                        service.adminDecideSignup(args.getOrNull(3) ?: invalid("admin signups approve|reject MATRICULA"), args[2] == "approve")
                        println(if (args[2] == "approve") "Solicitud aprobada" else "Solicitud rechazada")
                    }

                    else -> invalid("admin signups [list] | approve MATRICULA | reject MATRICULA")
                }
            } else if (args.firstOrNull() == "admin") {
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

                    listOf("users", "role") -> {
                        require(args.size == 5) { "admin users role MATRICULA admin|teacher|student" }
                        val user = service.setRole(args[3], args[4])
                        println("${user.matricula} (${user.name}) ahora es ${user.role}")
                    }

                    listOf("server", "name") -> {
                        require(args.size == 4) { "admin server name 'Nombre del servidor'" }
                        val identity = service.renameServer(args[3])
                        println("Servidor ${identity.id}: ${identity.name}")
                    }

                    listOf("server", "show") -> service.serverIdentity().let { println("Servidor ${it.id}: ${it.name}") }

                    else -> {
                        val usage = "admin attendance MATRICULA|* [DESDE YYYY-MM-DD] [HASTA YYYY-MM-DD] [CURSOR] [--class ID] [--csv]"
                        require(args.getOrNull(1) == "attendance") { usage }
                        val rest = args.drop(2)
                        val classId = options(rest, "--class").lastOrNull()
                        val csv = "--csv" in rest
                        val positional = rest.filterIndexed { i, value -> value != "--csv" && value != "--class" && rest.getOrNull(i - 1) != "--class" }
                        require(positional.size in 1..4) { usage }
                        val p = obj("from" to positional.getOrNull(1), "to" to positional.getOrNull(2), "before" to positional.getOrNull(3), "limit" to 100, "classId" to classId)
                        val who = positional[0].takeUnless { it == "*" }
                        if (csv) print(service.attendanceCsv(who, p)) else println(service.adminAttendance(who, p))
                    }
                }
            } else {
                require(args.isEmpty() || args.toList() == listOf("serve")) { "Use serve, healthcheck or admin" }
                // A certificate issued into TLS_DIR wins; otherwise the provisioned TLS_KEYSTORE is used.
                val tls = tlsDirectory()
                val (keystore, keystorePassword) = servingKeystore(tls)
                val serverTls = ReloadableServerTls(keystore, keystorePassword)
                val context = serverTls.context
                val watcher = CertificateWatcher(tls, serverTls)
                val sessions = Sessions(DatabaseSessionStore(db))
                val ca = Tls.caFromKeystore(keystore, keystorePassword)
                    ?: System.getenv("TLS_CA_FILE")?.let { Tls.readCertificate(Path.of(it)) }
                val links = ca?.let { EnrollmentLinks({ ServerQr.defaultHosts(serverTls.keystore, serverTls.password).map { h -> ServerQr.address(h, env("SERVER_PUBLIC_PORT", env("SERVER_PORT", "5050")).toInt()) } }, it, service::serverIdentity) }
                val limiter = LoginLimiter()
                val server = TcpServer(service, db, context, env("SERVER_HOST", "0.0.0.0"), env("SERVER_PORT", "5050").toInt(), sessions, ca, links, limiter, maxConnections)
                // The admin panel: HTTPS on its own port with the same reloadable certificate.
                val panel = if (panelEnabled(System.getenv("PANEL_ENABLED"))) {
                    val certificates = if (Files.exists(tls.caCertificate)) {
                        PanelCertificates(tls, { NetworkAddresses.detect(System.getenv("SERVER_PUBLIC_ADDRESSES")) }, { watcher.check() })
                    } else {
                        null
                    }
                    PanelServer(service, db, context, env("PANEL_HOST", env("SERVER_HOST", "0.0.0.0")), env("PANEL_PORT", "5443").toInt(), limiter, links, certificates)
                } else {
                    null
                }
                val maintenance = Maintenance()
                maintenance.every(1, TimeUnit.HOURS, "processed request purge") { service.purgeProcessedRequests(retention) }
                maintenance.every(1, TimeUnit.HOURS, "expired session purge") { sessions.purgeExpired() }
                panel?.let { p -> maintenance.every(1, TimeUnit.HOURS, "panel session purge") { p.sessions.purgeExpired() } }
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
                        panel?.close()
                        server.close()
                        stop.countDown()
                    },
                )
                server.start()
                panel?.start()
                println(panel?.let { "Panel HTTPS en el puerto ${it.port}" } ?: "Panel desactivado (PANEL_ENABLED=false)")
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
