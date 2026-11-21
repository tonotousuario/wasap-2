package wasap

import com.google.zxing.BinaryBitmap
import com.google.zxing.client.j2se.BufferedImageLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.QRCodeReader
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.util.Base64
import javax.imageio.ImageIO
import kotlin.test.*

class ServerQrTest {
    private val dir = Files.createTempDirectory("wasap-qr-test")
    private val tls = TlsDirectory(dir)
    private val passphrase = "frase de prueba larga".toCharArray()

    @AfterEach fun cleanup() {
        dir.toFile().deleteRecursively()
    }

    private fun params(link: String): List<Pair<String, String>> = URI(link).rawQuery.split("&").map {
        val (k, v) = it.split("=", limit = 2)
        k to URLDecoder.decode(v, StandardCharsets.UTF_8)
    }

    @Test fun `the link carries id, name, every address in order and the CA`() {
        val ca = CertificateAuthority.create(tls, passphrase)
        val link = ServerQr.link("a2f1c0de-0000-4000-8000-000000000001", "Redes 5.º A & B", listOf("192.168.1.50:5050", "10.8.0.1:5050"), ca)
        assertTrue(link.startsWith("wasap://server?v=1&"))
        val p = params(link)
        assertEquals("a2f1c0de-0000-4000-8000-000000000001", p.single { it.first == "id" }.second)
        assertEquals("Redes 5.º A & B", p.single { it.first == "name" }.second)
        assertEquals(listOf("192.168.1.50:5050", "10.8.0.1:5050"), p.filter { it.first == "a" }.map { it.second })
        val der = Base64.getUrlDecoder().decode(p.single { it.first == "ca" }.second)
        val decoded = CertificateFactory.getInstance("X.509").generateCertificate(der.inputStream()) as X509Certificate
        assertEquals(Tls.fingerprint(ca), Tls.fingerprint(decoded))
        assertFalse(link.contains("+") || link.contains(" "), "spaces are %20, base64 is url-safe")
    }

    @Test fun `addresses and certificate are validated`() {
        val ca = CertificateAuthority.create(tls, passphrase)
        assertEquals("VALIDATION", assertFailsWith<ApiError> { ServerQr.link("x", "n", emptyList(), ca) }.code)
        assertEquals("VALIDATION", assertFailsWith<ApiError> { ServerQr.link("x", "n", List(6) { "10.0.0.$it:5050" }, ca) }.code)
        assertEquals("VALIDATION", assertFailsWith<ApiError> { ServerQr.link("x", "n", listOf("10.0.0.1:70000"), ca) }.code)
        assertEquals("VALIDATION", assertFailsWith<ApiError> { ServerQr.link("x", "n", listOf("10.0.0.1"), ca) }.code)
        CertificateAuthority.issue(tls, passphrase, listOf("10.0.0.1"))
        val leaf = java.security.KeyStore.getInstance("PKCS12").apply { Files.newInputStream(tls.keystore).use { load(it, tls.readKeystorePassword().toCharArray()) } }
            .getCertificate("wasap") as X509Certificate
        assertEquals("VALIDATION", assertFailsWith<ApiError> { ServerQr.link("x", "n", listOf("10.0.0.1:5050"), leaf) }.code, "a server certificate is not a CA")
        assertEquals("[2001:db8::5]:5050", ServerQr.withPort("2001:db8::5", 5050))
        assertEquals("[2001:db8::5]:6000", ServerQr.withPort("[2001:db8::5]:6000", 5050))
        assertEquals("10.0.0.1:6000", ServerQr.withPort("10.0.0.1:6000", 5050))
        assertEquals("aula.local:5050", ServerQr.withPort("aula.local", 5050))
    }

    @Test fun `default hosts follow the certificate and drop loopback`() {
        CertificateAuthority.create(tls, passphrase)
        CertificateAuthority.issue(tls, passphrase, listOf("192.168.1.50", "10.8.0.1"), listOf("aula.local"))
        assertEquals(listOf("192.168.1.50", "10.8.0.1", "aula.local"), ServerQr.defaultHosts(tls.keystore, tls.readKeystorePassword()))
        CertificateAuthority.issue(tls, passphrase, emptyList())
        assertEquals(listOf("127.0.0.1"), ServerQr.defaultHosts(tls.keystore, tls.readKeystorePassword()), "only loopback left")
    }

    @Test fun `the PNG decodes back to the same link with a real RSA 3072 CA`() {
        val ca = CertificateAuthority.create(tls, passphrase)
        val link = ServerQr.link("a2f1c0de-0000-4000-8000-000000000001", "Wasap", listOf("192.168.1.50:5050", "10.8.0.1:5050", "aula.local:5050"), ca)
        val png = dir.resolve("qr.png")
        ServerQr.png(ServerQr.matrix(link), png)
        val image = ImageIO.read(png.toFile())
        val text = QRCodeReader().decode(BinaryBitmap(HybridBinarizer(BufferedImageLuminanceSource(image)))).text
        assertEquals(link, text)
        val width = ServerQr.matrix(link, margin = 0).width
        assertTrue(width <= 149, "version 33 or lower: ${link.length} chars, $width modules")
        val lines = ServerQr.terminal(ServerQr.matrix(link, margin = 2)).trimEnd('\n').lines()
        assertTrue(lines.all { it.replace(Regex("\u001b\\[[0-9;]*m"), "").length <= 80 }, "fits an 80-column terminal")
    }

    @Test fun `the terminal rendering maps every 2x2 cell to the right quadrant`() {
        val matrix = com.google.zxing.common.BitMatrix(3, 3).apply {
            set(0, 0)
            set(1, 1)
            set(2, 2)
        }
        val plain = ServerQr.terminal(matrix).replace(Regex("\u001b\\[[0-9;]*m"), "")
        assertEquals("▚ \n ▘\n", plain)
    }
}
