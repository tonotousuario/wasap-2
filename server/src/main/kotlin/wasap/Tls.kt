package wasap

import java.nio.file.Files
import java.nio.file.Path
import java.security.KeyStore
import java.security.cert.CertificateFactory
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
    fun clientContext(ca: Path): SSLContext {
        val store = KeyStore.getInstance(KeyStore.getDefaultType()).apply { load(null, null) }
        Files.newInputStream(ca).use { input -> store.setCertificateEntry("ca", CertificateFactory.getInstance("X.509").generateCertificate(input)) }
        val tm = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply { init(store) }
        return SSLContext.getInstance("TLS").apply { init(null, tm.trustManagers, null) }
    }
}
