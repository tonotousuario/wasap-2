package wasap

import org.bouncycastle.openssl.jcajce.JcaPEMWriter
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import java.io.StringWriter
import java.net.InetAddress
import java.net.InetSocketAddress
import java.nio.file.Files
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.cert.X509Certificate
import java.time.Duration
import java.time.Instant
import javax.net.ssl.SSLServerSocket
import javax.net.ssl.SSLSocket
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager
import kotlin.concurrent.thread
import kotlin.test.*

class CertificatesTest {
    private val dir = Files.createTempDirectory("wasap-ca-test")
    private val tls = TlsDirectory(dir)
    private val passphrase = "frase de prueba larga".toCharArray()

    @AfterEach fun cleanup() {
        dir.toFile().deleteRecursively()
    }

    private fun issuedLeaf(): X509Certificate = KeyStore.getInstance("PKCS12").apply {
        Files.newInputStream(tls.keystore).use { load(it, tls.readKeystorePassword().toCharArray()) }
    }.getCertificate("wasap") as X509Certificate

    @Test fun `the CA key is stored only encrypted and opens with the right passphrase`() {
        val ca = CertificateAuthority.create(tls, passphrase)
        assertTrue(ca.basicConstraints >= 0, "is a CA")
        val stored = Files.readString(tls.caKey)
        assertTrue(stored.contains("BEGIN ENCRYPTED PRIVATE KEY"))
        dir.toFile().walk().filter { it.isFile }.forEach { file ->
            assertFalse(file.readText(Charsets.ISO_8859_1).contains("BEGIN PRIVATE KEY"), "no clear key in ${file.name}")
            assertFalse(file.readText(Charsets.ISO_8859_1).contains("BEGIN RSA PRIVATE KEY"), "no clear key in ${file.name}")
        }
        assertEquals("rw-------", Files.getPosixFilePermissions(tls.caKey).let { java.nio.file.attribute.PosixFilePermissions.toString(it) })
        assertNotNull(CertificateAuthority.loadKey(tls, passphrase))
        assertEquals("CONFLICT", assertFailsWith<ApiError> { CertificateAuthority.create(tls, passphrase) }.code)
    }

    @Test fun `a wrong passphrase and a missing key fail with the same message`() {
        CertificateAuthority.create(tls, passphrase)
        val wrong = assertFailsWith<ApiError> { CertificateAuthority.loadKey(tls, "otra frase cualquiera".toCharArray()) }
        val missing = assertFailsWith<ApiError> { CertificateAuthority.loadKey(TlsDirectory(dir.resolve("vacio")), passphrase) }
        assertEquals(wrong.message, missing.message)
        assertEquals("VALIDATION", assertFailsWith<ApiError> { CertificateAuthority.create(TlsDirectory(dir.resolve("b")), "corta".toCharArray()) }.code)
    }

    @Test fun `an existing plain CA key is imported encrypted and must match its certificate`() {
        val source = Files.createTempDirectory("wasap-ca-source")
        try {
            val original = CertificateAuthority.create(TlsDirectory(source), passphrase)
            val key = CertificateAuthority.loadKey(TlsDirectory(source), passphrase)
            val plain = source.resolve("ca.key").also { path ->
                Files.writeString(path, StringWriter().also { out -> JcaPEMWriter(out).use { it.writeObject(key) } }.toString())
            }
            val imported = CertificateAuthority.import(tls, plain, source.resolve("ca.crt"), passphrase)
            assertEquals(Tls.fingerprint(original), Tls.fingerprint(imported))
            assertTrue(Files.readString(tls.caKey).contains("ENCRYPTED"))
            val other = KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair().private
            val wrongKey = source.resolve("other.key").also { path ->
                Files.writeString(path, StringWriter().also { out -> JcaPEMWriter(out).use { it.writeObject(other) } }.toString())
            }
            val error = assertFailsWith<ApiError> { CertificateAuthority.import(TlsDirectory(dir.resolve("c")), wrongKey, source.resolve("ca.crt"), passphrase) }
            assertEquals("VALIDATION", error.code)
        } finally {
            source.toFile().deleteRecursively()
        }
    }

    @Test fun `issued certificates carry every address, serverAuth and a chain to the CA`() {
        val ca = CertificateAuthority.create(tls, passphrase)
        val now = Instant.now()
        val issued = CertificateAuthority.issue(tls, passphrase, listOf("192.168.1.50", "10.8.0.1"), listOf("Wasap.Escuela.local"), now = now)
        assertEquals(listOf("192.168.1.50", "10.8.0.1", "127.0.0.1"), issued.addresses)
        val leaf = issuedLeaf()
        val sans = leaf.subjectAlternativeNames.map { it[1].toString() }
        assertEquals(setOf("192.168.1.50", "10.8.0.1", "127.0.0.1", "wasap.escuela.local"), sans.toSet())
        assertTrue("1.3.6.1.5.5.7.3.1" in leaf.extendedKeyUsage, "serverAuth")
        assertEquals(-1, leaf.basicConstraints, "not a CA")
        assertTrue(Duration.between(now, leaf.notAfter.toInstant()).toDays() in 364..365)
        leaf.verify(ca.publicKey)
        val trust = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply {
            init(
                KeyStore.getInstance(KeyStore.getDefaultType()).apply {
                    load(null, null)
                    setCertificateEntry("ca", ca)
                },
            )
        }.trustManagers.single() as X509TrustManager
        val chain = KeyStore.getInstance("PKCS12").apply { Files.newInputStream(tls.keystore).use { load(it, tls.readKeystorePassword().toCharArray()) } }
            .getCertificateChain("wasap").map { it as X509Certificate }.toTypedArray()
        trust.checkServerTrusted(chain, "RSA")
        assertEquals(ca, Tls.caFromKeystore(tls.keystore, tls.readKeystorePassword()), "the chain carries the CA for server.hello")
    }

    @Test fun `a client validating with the CA completes a TLS handshake against the issued certificate`() {
        CertificateAuthority.create(tls, passphrase)
        CertificateAuthority.issue(tls, passphrase, listOf("192.168.1.50"))
        val context = Tls.serverContext(tls.keystore, tls.readKeystorePassword())
        (context.serverSocketFactory.createServerSocket() as SSLServerSocket).use { server ->
            server.bind(InetSocketAddress("127.0.0.1", 0))
            val acceptor = thread { server.accept().use { (it as SSLSocket).startHandshake() } }
            (Tls.clientContext(tls.caCertificate).socketFactory.createSocket("127.0.0.1", server.localPort) as SSLSocket).use { client ->
                client.soTimeout = 5000
                client.sslParameters = client.sslParameters.apply { endpointIdentificationAlgorithm = "HTTPS" }
                client.startHandshake()
            }
            acceptor.join(5000)
        }
    }

    @Test fun `issuing with a wrong passphrase writes nothing`() {
        CertificateAuthority.create(tls, passphrase)
        assertFailsWith<ApiError> { CertificateAuthority.issue(tls, "frase equivocada larga".toCharArray(), listOf("10.0.0.1")) }
        assertFalse(tls.hasIssuedCertificate())
        assertEquals("VALIDATION", assertFailsWith<ApiError> { CertificateAuthority.issue(tls, passphrase, listOf("no-es-ip")) }.code)
    }

    @Test fun `detected addresses put configured ones first, then private IPv4, other IPv4 and global IPv6`() {
        val available = listOf("127.0.0.1", "::1", "fe80::1", "2001:db8::5", "8.8.4.4", "192.168.1.50", "10.8.0.1", "0.0.0.0")
            .map { InetAddress.ofLiteral(it) }
        assertEquals(
            listOf("203.0.113.9", "192.168.1.50", "10.8.0.1", "8.8.4.4", "2001:db8:0:0:0:0:0:5"),
            NetworkAddresses.detect(" 203.0.113.9 , 192.168.1.50", available),
        )
        assertEquals(emptyList(), NetworkAddresses.detect(null, available.filter { it.isLoopbackAddress }))
    }

    @Test fun `status reports the CA and the issued certificate`() {
        assertTrue(CertificateStatus.describe(tls).contains("no configurada"))
        val ca = CertificateAuthority.create(tls, passphrase)
        CertificateAuthority.issue(tls, passphrase, listOf("192.168.1.50"))
        val status = CertificateStatus.describe(tls)
        assertTrue(status.contains(Tls.fingerprint(ca)))
        assertTrue(status.contains("cifrada"))
        assertTrue(status.contains("192.168.1.50"))
    }
}
