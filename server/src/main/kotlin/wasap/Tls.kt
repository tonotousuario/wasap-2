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
            "Renew it with `wasap-server certs issue` (or the panel); the server reloads it without a restart."
    }

    /** Lower-case hex SHA-256 of a certificate's DER encoding. */
    fun fingerprint(certificate: java.security.cert.Certificate): String = java.security.MessageDigest.getInstance("SHA-256").digest(certificate.encoded).joinToString("") { "%02x".format(it) }

    fun readCertificate(path: Path): X509Certificate = Files.newInputStream(path).use { CertificateFactory.getInstance("X.509").generateCertificate(it) as X509Certificate }

    /** The self-signed root (installation CA) carried in the keystore's chain, if any. */
    fun caFromKeystore(keystore: Path, password: String): X509Certificate? {
        val store = KeyStore.getInstance("PKCS12")
        Files.newInputStream(keystore).use { store.load(it, password.toCharArray()) }
        return store.aliases().toList().flatMap { store.getCertificateChain(it)?.toList() ?: emptyList() }
            .map { it as X509Certificate }
            .firstOrNull { it.subjectX500Principal == it.issuerX500Principal && it.basicConstraints >= 0 }
    }

    fun clientContext(ca: Path): SSLContext {
        val store = KeyStore.getInstance(KeyStore.getDefaultType()).apply { load(null, null) }
        Files.newInputStream(ca).use { input -> store.setCertificateEntry("ca", CertificateFactory.getInstance("X.509").generateCertificate(input)) }
        val tm = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply { init(store) }
        return SSLContext.getInstance("TLS").apply { init(null, tm.trustManagers, null) }
    }
}

/**
 * Server TLS whose certificate can be replaced while running: new handshakes use the latest
 * keystore, open connections keep the session they negotiated.
 */
class ReloadableServerTls(keystore: Path, password: String) {
    private val current = java.util.concurrent.atomic.AtomicReference(keyManager(keystore, password))

    @Volatile var keystore: Path = keystore
        private set

    @Volatile var password: String = password
        private set

    val context: SSLContext = SSLContext.getInstance("TLS").apply { init(arrayOf(Delegate()), null, null) }

    /** Loads and validates [keystore] first, so a broken file never replaces a working one. */
    fun reload(keystore: Path, password: String) {
        current.set(keyManager(keystore, password))
        this.keystore = keystore
        this.password = password
    }

    private fun keyManager(keystore: Path, password: String): X509ExtendedKeyManager {
        val store = KeyStore.getInstance("PKCS12")
        Files.newInputStream(keystore).use { store.load(it, password.toCharArray()) }
        require(store.aliases().toList().any { store.isKeyEntry(it) }) { "Keystore has no private key" }
        store.aliases().toList().forEach { alias -> store.getCertificateChain(alias)?.forEach { (it as X509Certificate).checkValidity() } }
        val factory = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm()).apply { init(store, password.toCharArray()) }
        return factory.keyManagers.filterIsInstance<X509ExtendedKeyManager>().single()
    }

    private inner class Delegate : X509ExtendedKeyManager() {
        private val km get() = current.get()
        override fun getClientAliases(keyType: String?, issuers: Array<out java.security.Principal>?) = km.getClientAliases(keyType, issuers)
        override fun chooseClientAlias(keyType: Array<out String>?, issuers: Array<out java.security.Principal>?, socket: java.net.Socket?) = km.chooseClientAlias(keyType, issuers, socket)
        override fun getServerAliases(keyType: String?, issuers: Array<out java.security.Principal>?) = km.getServerAliases(keyType, issuers)
        override fun chooseServerAlias(keyType: String?, issuers: Array<out java.security.Principal>?, socket: java.net.Socket?) = km.chooseServerAlias(keyType, issuers, socket)
        override fun chooseEngineServerAlias(keyType: String?, issuers: Array<out java.security.Principal>?, engine: SSLEngine?) = km.chooseEngineServerAlias(keyType, issuers, engine)
        override fun getCertificateChain(alias: String?) = km.getCertificateChain(alias)
        override fun getPrivateKey(alias: String?) = km.getPrivateKey(alias)
    }
}

/** Picks up a certificate issued into TLS_DIR (by `certs issue` or the panel) without a restart. */
class CertificateWatcher(private val tls: TlsDirectory, private val server: ReloadableServerTls) {
    private var seen: java.nio.file.attribute.FileTime? =
        if (server.keystore == tls.keystore && Files.exists(tls.keystore)) Files.getLastModifiedTime(tls.keystore) else null

    /** Reloads when the issued keystore changed since the last check; true when it did. */
    @Synchronized fun check(): Boolean {
        if (!tls.hasIssuedCertificate()) return false
        val modified = Files.getLastModifiedTime(tls.keystore)
        if (modified == seen) return false
        server.reload(tls.keystore, tls.readKeystorePassword())
        seen = modified
        return true
    }
}
