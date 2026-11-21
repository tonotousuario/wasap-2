package wasap

import org.bouncycastle.asn1.pkcs.PrivateKeyInfo
import org.bouncycastle.asn1.x500.X500Name
import org.bouncycastle.asn1.x509.BasicConstraints
import org.bouncycastle.asn1.x509.ExtendedKeyUsage
import org.bouncycastle.asn1.x509.Extension
import org.bouncycastle.asn1.x509.GeneralName
import org.bouncycastle.asn1.x509.GeneralNames
import org.bouncycastle.asn1.x509.KeyPurposeId
import org.bouncycastle.asn1.x509.KeyUsage
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter
import org.bouncycastle.cert.jcajce.JcaX509ExtensionUtils
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder
import org.bouncycastle.jce.provider.BouncyCastleProvider
import org.bouncycastle.openssl.PEMKeyPair
import org.bouncycastle.openssl.PEMParser
import org.bouncycastle.openssl.PKCS8Generator
import org.bouncycastle.openssl.jcajce.JcaPEMKeyConverter
import org.bouncycastle.openssl.jcajce.JcaPEMWriter
import org.bouncycastle.openssl.jcajce.JcaPKCS8Generator
import org.bouncycastle.openssl.jcajce.JceOpenSSLPKCS8DecryptorProviderBuilder
import org.bouncycastle.openssl.jcajce.JceOpenSSLPKCS8EncryptorBuilder
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder
import org.bouncycastle.pkcs.PKCS8EncryptedPrivateKeyInfo
import java.io.StringWriter
import java.math.BigInteger
import java.net.InetAddress
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.nio.file.attribute.PosixFilePermissions
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.SecureRandom
import java.security.cert.X509Certificate
import java.time.Duration
import java.time.Instant
import java.util.Base64
import java.util.Date

/** Files of the writable TLS directory (TLS_DIR). The CA key only ever exists encrypted here. */
class TlsDirectory(val dir: Path) {
    val caCertificate: Path = dir.resolve("ca.crt")
    val caKey: Path = dir.resolve("ca.key.p8")
    val keystore: Path = dir.resolve("server.p12")
    val keystorePassword: Path = dir.resolve("server.p12.password")

    fun hasIssuedCertificate() = Files.exists(keystore) && Files.exists(keystorePassword)
    fun readKeystorePassword(): String = Files.readString(keystorePassword).trim()
}

data class IssuedCertificate(val serial: BigInteger, val notAfter: Instant, val addresses: List<String>, val dnsNames: List<String>)

/** The installation CA kept on the server, its key encrypted with the administrator's passphrase. */
object CertificateAuthority {
    private val provider = BouncyCastleProvider()
    private val random = SecureRandom()
    private const val ITERATIONS = 600_000
    private const val UNUSABLE = "No se pudo usar la CA: la frase es incorrecta o la clave no está disponible"

    fun validatePassphrase(passphrase: CharArray) {
        if (passphrase.size < 12) invalid("La frase de la CA debe tener al menos 12 caracteres")
    }

    /** Creates a new CA (RSA 3072, 10 years). Refuses to overwrite an existing one. */
    fun create(tls: TlsDirectory, passphrase: CharArray, name: String = "Wasap Installation CA", now: Instant = Instant.now()): X509Certificate {
        validatePassphrase(passphrase)
        if (Files.exists(tls.caCertificate) || Files.exists(tls.caKey)) throw ApiError("CONFLICT", "Ya existe una CA en ${tls.dir}")
        val keys = generateKeys(3072)
        val subject = X500Name("CN=$name")
        val builder = JcaX509v3CertificateBuilder(subject, serial(), Date.from(now.minusSeconds(60)), Date.from(now.plus(Duration.ofDays(3650))), subject, keys.public)
            .addExtension(Extension.basicConstraints, true, BasicConstraints(true))
            .addExtension(Extension.keyUsage, true, KeyUsage(KeyUsage.keyCertSign or KeyUsage.cRLSign))
            .addExtension(Extension.subjectKeyIdentifier, false, JcaX509ExtensionUtils().createSubjectKeyIdentifier(keys.public))
        val certificate = sign(builder, keys.private)
        save(tls, certificate, keys.private, passphrase)
        return certificate
    }

    /** Encrypts an existing PEM CA key (as produced by scripts/create-certs.sh) next to its certificate. */
    fun import(tls: TlsDirectory, keyPem: Path, certificatePem: Path, passphrase: CharArray): X509Certificate {
        validatePassphrase(passphrase)
        if (Files.exists(tls.caKey)) throw ApiError("CONFLICT", "Ya existe una CA cifrada en ${tls.dir}")
        val certificate = Tls.readCertificate(certificatePem)
        if (certificate.basicConstraints < 0) invalid("El certificado indicado no es de una CA")
        val key = readPlainKey(keyPem)
        if (!matches(key, certificate)) invalid("La clave no corresponde al certificado de la CA")
        save(tls, certificate, key, passphrase)
        return certificate
    }

    /** Decrypts the CA key in memory; a wrong passphrase and a missing key fail the same way. */
    fun loadKey(tls: TlsDirectory, passphrase: CharArray): PrivateKey = try {
        val encrypted = PEMParser(Files.newBufferedReader(tls.caKey)).use { it.readObject() } as PKCS8EncryptedPrivateKeyInfo
        val info = encrypted.decryptPrivateKeyInfo(JceOpenSSLPKCS8DecryptorProviderBuilder().setProvider(provider).build(passphrase))
        JcaPEMKeyConverter().setProvider(provider).getPrivateKey(info)
    } catch (_: Exception) {
        throw ApiError("VALIDATION", UNUSABLE)
    }

    /**
     * Issues a 1-year server certificate for [addresses] (IP literals) and [dnsNames], always adding
     * 127.0.0.1, and writes it with the CA chain to a fresh PKCS12 with a random password.
     */
    fun issue(
        tls: TlsDirectory,
        passphrase: CharArray,
        addresses: List<String>,
        dnsNames: List<String> = emptyList(),
        days: Long = 365,
        now: Instant = Instant.now(),
        beforePublish: (IssuedCertificate) -> Unit = {},
    ): IssuedCertificate {
        val ips = (addresses + "127.0.0.1").map(::ipLiteral).distinct()
        val names = dnsNames.map { it.trim().lowercase() }.filter { it.isNotEmpty() }.distinct()
        names.forEach { if (!it.matches(Regex("[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*"))) invalid("Nombre DNS inválido: $it") }
        if (!Files.exists(tls.caCertificate)) throw ApiError("VALIDATION", UNUSABLE)
        val caKey = loadKey(tls, passphrase)
        val ca = Tls.readCertificate(tls.caCertificate)
        val keys = generateKeys(2048)
        val serial = serial()
        val notAfter = now.plus(Duration.ofDays(days))
        val san = GeneralNames(
            (ips.map { GeneralName(GeneralName.iPAddress, it.hostAddress) } + names.map { GeneralName(GeneralName.dNSName, it) }).toTypedArray(),
        )
        val utils = JcaX509ExtensionUtils()
        val builder = JcaX509v3CertificateBuilder(ca, serial, Date.from(now.minusSeconds(60)), Date.from(notAfter), X500Name("CN=Wasap Server"), keys.public)
            .addExtension(Extension.basicConstraints, true, BasicConstraints(false))
            .addExtension(Extension.keyUsage, true, KeyUsage(KeyUsage.digitalSignature or KeyUsage.keyEncipherment))
            .addExtension(Extension.extendedKeyUsage, false, ExtendedKeyUsage(KeyPurposeId.id_kp_serverAuth))
            .addExtension(Extension.subjectAlternativeName, false, san)
            .addExtension(Extension.subjectKeyIdentifier, false, utils.createSubjectKeyIdentifier(keys.public))
            .addExtension(Extension.authorityKeyIdentifier, false, utils.createAuthorityKeyIdentifier(ca))
        val certificate = sign(builder, caKey)
        val password = Base64.getUrlEncoder().withoutPadding().encodeToString(ByteArray(32).also(random::nextBytes))
        val store = KeyStore.getInstance("PKCS12").apply {
            load(null, null)
            setKeyEntry("wasap", keys.private, password.toCharArray(), arrayOf(certificate, ca))
        }
        val issued = IssuedCertificate(serial, notAfter, ips.map { it.hostAddress }, names)
        beforePublish(issued)
        // Password first, keystore last: a reader that sees the new keystore also sees its password.
        writePrivate(tls.keystorePassword) { Files.writeString(it, password) }
        writePrivate(tls.keystore) { path -> Files.newOutputStream(path).use { store.store(it, password.toCharArray()) } }
        return issued
    }

    private fun ipLiteral(value: String): InetAddress = try {
        InetAddress.ofLiteral(value.trim())
    } catch (_: IllegalArgumentException) {
        invalid("Dirección IP inválida: $value")
    }

    private fun save(tls: TlsDirectory, certificate: X509Certificate, key: PrivateKey, passphrase: CharArray) {
        Files.createDirectories(tls.dir)
        val encryptor = JceOpenSSLPKCS8EncryptorBuilder(PKCS8Generator.AES_256_CBC)
            .setPRF(PKCS8Generator.PRF_HMACSHA256)
            .setIterationCount(ITERATIONS)
            .setRandom(random)
            .setProvider(provider)
            .setPassword(passphrase)
            .build()
        val pem = StringWriter().also { out -> JcaPEMWriter(out).use { it.writeObject(JcaPKCS8Generator(key, encryptor)) } }.toString()
        writePrivate(tls.caKey) { Files.writeString(it, pem) }
        val certPem = StringWriter().also { out -> JcaPEMWriter(out).use { it.writeObject(certificate) } }.toString()
        writeAtomically(tls.caCertificate, private = false) { Files.writeString(it, certPem) }
    }

    private fun readPlainKey(path: Path): PrivateKey = PEMParser(Files.newBufferedReader(path)).use { parser ->
        when (val value = parser.readObject()) {
            is PrivateKeyInfo -> JcaPEMKeyConverter().setProvider(provider).getPrivateKey(value)
            is PEMKeyPair -> JcaPEMKeyConverter().setProvider(provider).getKeyPair(value).private
            else -> invalid("La clave de la CA debe ser un PEM sin cifrar (PKCS#8 o PKCS#1)")
        }
    }

    private fun matches(key: PrivateKey, certificate: X509Certificate): Boolean {
        val probe = ByteArray(32).also(random::nextBytes)
        val signature = java.security.Signature.getInstance("SHA256withRSA")
        signature.initSign(key)
        signature.update(probe)
        val signed = signature.sign()
        signature.initVerify(certificate.publicKey)
        signature.update(probe)
        return runCatching { signature.verify(signed) }.getOrDefault(false)
    }

    private fun generateKeys(bits: Int): KeyPair = KeyPairGenerator.getInstance("RSA").apply { initialize(bits, random) }.generateKeyPair()
    private fun serial() = BigInteger(127, random).add(BigInteger.ONE)
    private fun sign(builder: org.bouncycastle.cert.X509v3CertificateBuilder, key: PrivateKey): X509Certificate = JcaX509CertificateConverter().getCertificate(builder.build(JcaContentSignerBuilder("SHA256withRSA").build(key)))

    private fun writePrivate(target: Path, write: (Path) -> Unit) = writeAtomically(target, private = true, write)

    /** Writes next to [target] and renames over it, so readers never see a partial file. */
    private fun writeAtomically(target: Path, private: Boolean, write: (Path) -> Unit) {
        Files.createDirectories(target.toAbsolutePath().parent)
        val temp = Files.createTempFile(target.toAbsolutePath().parent, ".${target.fileName}", ".tmp")
        try {
            runCatching { Files.setPosixFilePermissions(temp, PosixFilePermissions.fromString(if (private) "rw-------" else "rw-r--r--")) }
            write(temp)
            Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
        } finally {
            Files.deleteIfExists(temp)
        }
    }
}

/** Human-readable state of the TLS directory for `certs status` and the panel. */
object CertificateStatus {
    fun describe(tls: TlsDirectory, now: Instant = Instant.now()): String = buildString {
        if (Files.exists(tls.caCertificate)) {
            val ca = Tls.readCertificate(tls.caCertificate)
            appendLine("CA: ${ca.subjectX500Principal.name}, vence ${ca.notAfter.toInstant()}")
            appendLine("Huella SHA-256 de la CA: ${Tls.fingerprint(ca)}")
            appendLine("Clave de la CA: ${if (Files.exists(tls.caKey)) "cifrada en ${tls.caKey}" else "no importada"}")
        } else {
            appendLine("CA: no configurada en ${tls.dir} (usa certs init o certs import)")
        }
        if (tls.hasIssuedCertificate()) {
            val password = tls.readKeystorePassword()
            val leaf = KeyStore.getInstance("PKCS12").apply { Files.newInputStream(tls.keystore).use { load(it, password.toCharArray()) } }
                .let { it.getCertificate("wasap") as X509Certificate }
            val sans = leaf.subjectAlternativeNames.orEmpty().map { it[1].toString() }
            append("Certificado del servidor: ${sans.joinToString()}, vence ${leaf.notAfter.toInstant()}")
            Tls.expiryWarning(leaf.notAfter.toInstant(), now)?.let { append("\n").append(it) }
        } else {
            append("Certificado del servidor: ninguno emitido aquí (se usa TLS_KEYSTORE)")
        }
    }
}
