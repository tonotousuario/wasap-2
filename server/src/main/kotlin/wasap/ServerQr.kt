package wasap

import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.common.BitMatrix
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import java.awt.image.BufferedImage
import java.net.InetAddress
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.security.KeyStore
import java.security.cert.X509Certificate
import java.util.Base64
import javax.imageio.ImageIO

/**
 * The server enrollment QR (`wasap://server?v=1&id=…&name=…&a=host:port…&ca=…`): everything a
 * phone needs to trust and reach this server, with the full CA certificate as its only anchor.
 */
object ServerQr {
    const val VERSION = 1
    const val MAX_ADDRESSES = 5

    fun link(id: String, name: String, addresses: List<String>, ca: X509Certificate): String {
        if (addresses.isEmpty() || addresses.size > MAX_ADDRESSES) invalid("El QR lleva entre 1 y $MAX_ADDRESSES direcciones")
        if (ca.basicConstraints < 0) invalid("El certificado del QR debe ser el de la CA")
        addresses.forEach(::checkAddress)
        val ca64 = Base64.getUrlEncoder().withoutPadding().encodeToString(ca.encoded)
        return buildString {
            append("wasap://server?v=$VERSION&id=").append(encode(id)).append("&name=").append(encode(name))
            addresses.forEach { append("&a=").append(encode(it)) }
            append("&ca=").append(ca64)
        }
    }

    /** `host:port`, with IPv6 literals in brackets and a port in 1..65535. */
    fun checkAddress(address: String) {
        val match = Regex("""^(\[[0-9A-Fa-f:.]+]|[A-Za-z0-9.-]+):(\d{1,5})$""").matchEntire(address)
            ?: invalid("Dirección inválida: $address (usa host:puerto)")
        if (match.groupValues[2].toInt() !in 1..65535) invalid("Puerto inválido en $address")
    }

    /** host:port for [host], bracketing IPv6 literals. */
    fun address(host: String, port: Int): String = if (':' in host && !host.startsWith("[")) "[$host]:$port" else "$host:$port"

    /** [value] as given when it already has a port (`host:p`, `[v6]:p`), else with [port]. */
    fun withPort(value: String, port: Int): String = if (Regex("""^(\[[^]]+]|[^:\[\]]+):\d+$""").matches(value)) value else address(value.removeSurrounding("[", "]"), port)

    private fun encode(value: String) = URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20")

    /** Level M: with an RSA 3072 CA the code is version ~32 (145 modules); print it at 8 cm or more. */
    fun matrix(link: String, margin: Int = 4): BitMatrix = QRCodeWriter().encode(
        link,
        BarcodeFormat.QR_CODE,
        0,
        0,
        mapOf(EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M, EncodeHintType.MARGIN to margin, EncodeHintType.CHARACTER_SET to "UTF-8"),
    )

    /** Quadrant block for each 2×2 cell, indexed by bits top-left=1, top-right=2, bottom-left=4, bottom-right=8. */
    private const val QUADRANTS = " ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█"

    /**
     * Four modules per character with quadrant blocks, so a CA-sized QR (~150 modules) fits an
     * 80-column terminal; black on white with explicit ANSI colours to scan on any theme.
     */
    fun terminal(matrix: BitMatrix): String = buildString {
        fun dark(x: Int, y: Int) = x < matrix.width && y < matrix.height && matrix[x, y]
        for (y in 0 until matrix.height step 2) {
            append("\u001b[30;107m")
            for (x in 0 until matrix.width step 2) {
                val bits = (if (dark(x, y)) 1 else 0) or (if (dark(x + 1, y)) 2 else 0) or
                    (if (dark(x, y + 1)) 4 else 0) or (if (dark(x + 1, y + 1)) 8 else 0)
                append(QUADRANTS[bits])
            }
            append("\u001b[0m\n")
        }
    }

    fun png(matrix: BitMatrix, path: Path, scale: Int = 8) {
        val image = BufferedImage(matrix.width * scale, matrix.height * scale, BufferedImage.TYPE_BYTE_BINARY)
        for (y in 0 until image.height) {
            for (x in 0 until image.width) image.setRGB(x, y, if (matrix[x / scale, y / scale]) 0x000000 else 0xFFFFFF)
        }
        Files.newOutputStream(path).use { ImageIO.write(image, "png", it) }
    }

    /**
     * Addresses announced by default: the serving certificate's SAN (IPs then DNS names) in
     * issue order, without loopback unless nothing else is left.
     */
    fun defaultHosts(keystore: Path, password: String): List<String> {
        val store = KeyStore.getInstance("PKCS12").apply { Files.newInputStream(keystore).use { load(it, password.toCharArray()) } }
        val alias = store.aliases().toList().firstOrNull { store.isKeyEntry(it) } ?: invalid("El almacén TLS no tiene certificado de servidor")
        val leaf = store.getCertificate(alias) as X509Certificate
        val sans = leaf.subjectAlternativeNames.orEmpty()
        val ips = sans.filter { it[0] == 7 }.map { it[1].toString() }
        val dns = sans.filter { it[0] == 2 }.map { it[1].toString() }
        val external = ips.filterNot(::isLoopback) + dns
        return external.ifEmpty { ips }.distinct().take(MAX_ADDRESSES)
    }

    private fun isLoopback(ip: String) = runCatching { InetAddress.ofLiteral(ip).isLoopbackAddress }.getOrDefault(false)
}
