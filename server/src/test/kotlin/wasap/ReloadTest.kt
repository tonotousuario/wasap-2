package wasap

import kotlinx.serialization.json.*
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import java.math.BigInteger
import java.nio.file.Files
import java.security.cert.X509Certificate
import javax.net.ssl.SSLSocket
import kotlin.test.*

/** Hot certificate reload over real TLS sockets (server-identity-and-trust 3.1). */
@Tag("integration")
class ReloadTest {
    private lateinit var env: TestServer
    private val dir = Files.createTempDirectory("wasap-reload-test")
    private val tlsDir = TlsDirectory(dir)
    private val passphrase = "frase de prueba larga".toCharArray()

    @BeforeEach fun setup() {
        env = TestServer()
        env.service.createUser("A001", "Ana", "123456")
        // The CA created by scripts/create-certs.sh, imported encrypted as an operator would.
        CertificateAuthority.import(tlsDir, env.certs.resolve("ca.key"), env.certs.resolve("ca.crt"), passphrase)
    }

    @AfterEach fun cleanup() {
        if (::env.isInitialized) env.close()
        dir.toFile().deleteRecursively()
    }

    /** Serial of the certificate a brand-new client (no session cache) receives. */
    private fun presentedSerial(): BigInteger = (Tls.clientContext(env.certs.resolve("ca.crt")).socketFactory.createSocket("127.0.0.1", env.server.port) as SSLSocket).use {
        it.soTimeout = 5000
        it.sslParameters = it.sslParameters.apply { endpointIdentificationAlgorithm = "HTTPS" }
        it.startHandshake()
        (it.session.peerCertificates.first() as X509Certificate).serialNumber
    }

    @Test fun `a newly issued certificate is served to new connections while open ones keep working`() {
        env.connect().use { open ->
            open.login("A001", "123456")
            val before = presentedSerial()
            val issued = CertificateAuthority.issue(tlsDir, passphrase, listOf("192.168.77.7"))
            assertTrue(CertificateWatcher(tlsDir, env.tls).check(), "the watcher picks up the issued keystore")
            assertEquals(issued.serial, presentedSerial(), "new handshakes use the new certificate")
            assertNotEquals(before, issued.serial)
            assertEquals("success", open.request("attendance.state").string("type"), "the open connection keeps its session")
        }
    }

    @Test fun `the watcher ignores an unchanged keystore and a broken one never replaces a working one`() {
        CertificateAuthority.issue(tlsDir, passphrase, listOf("192.168.77.7"))
        val watcher = CertificateWatcher(tlsDir, env.tls)
        assertTrue(watcher.check())
        assertFalse(watcher.check(), "no change, no reload")
        val working = presentedSerial()
        Files.writeString(tlsDir.keystore, "not a keystore")
        assertFails { watcher.check() }
        assertEquals(working, presentedSerial(), "still serving the last good certificate")
    }
}
