package wasap

import java.nio.file.Files
import java.nio.file.Path
import java.security.KeyStore
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.time.Duration
import java.time.Instant
import javax.net.ssl.*

object Tls {
    fun serverContext(keystore: Path, password: String): SSLContext {
        val store = KeyStore.getInstance("PKCS12")
        Files.newInputStream(keystore).use { store.load(it, password.toCharArray()) }
        require(store.aliases().toList().any { store.isKeyEntry(it) }) { "Keystore has no private key" }
        store.aliases().toList().forEach { alias ->
            store.getCertificateChain(alias)?.forEach { (it as java.security.cert.X509Certificate).checkValidity() }
        }
        val km = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm())
        km.init(store, password.toCharArray())
        return SSLContext.getInstance("TLS").apply { init(km.keyManagers, null, null) }
    }

    /** Earliest notAfter of every certificate chain in the keystore. */
    fun earliestExpiry(keystore: Path, password: String): Instant {
        val store = KeyStore.getInstance("PKCS12")
        Files.newInputStream(keystore).use { store.load(it, password.toCharArray()) }
        return store.aliases().toList().flatMap { alias -> store.getCertificateChain(alias)?.toList() ?: emptyList() }
            .minOf { (it as X509Certificate).notAfter.toInstant() }
    }

    /** Operator warning when the server certificate expires within [threshold], otherwise null. */
    fun expiryWarning(expiry: Instant, now: Instant = Instant.now(), threshold: Duration = Duration.ofDays(30)): String? = if (Duration.between(now, expiry) >= threshold) {
        null
    } else {
        "WARNING: TLS certificate expires on $expiry (${Duration.between(now, expiry).toDays()} days). " +
            "Renew it with scripts/create-certs.sh using the same CA and restart the server."
    }

    fun clientContext(ca: Path): SSLContext {
        val store = KeyStore.getInstance(KeyStore.getDefaultType()).apply { load(null, null) }
        Files.newInputStream(ca).use { input -> store.setCertificateEntry("ca", CertificateFactory.getInstance("X.509").generateCertificate(input)) }
        val tm = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply { init(store) }
        return SSLContext.getInstance("TLS").apply { init(null, tm.trustManagers, null) }
    }
}
