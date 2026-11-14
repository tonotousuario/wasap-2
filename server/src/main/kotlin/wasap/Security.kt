package wasap

import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Instant
import java.util.Base64
import java.util.concurrent.ConcurrentHashMap
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

object Pins {
    private val random = SecureRandom()
    private const val ITERATIONS = 600000
    fun hash(pin: String): String {
        if (!pin.matches(Regex("[0-9]{6,12}"))) invalid("El PIN debe contener de 6 a 12 dígitos")
        val salt = ByteArray(16).also(random::nextBytes)
        val hash = derive(pin, salt)
        return "${Base64.getEncoder().encodeToString(salt)}:${Base64.getEncoder().encodeToString(hash)}"
    }
    private fun derive(pin: String, salt: ByteArray): ByteArray {
        val spec = PBEKeySpec(pin.toCharArray(), salt, ITERATIONS, 256)
        return try { SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded }
        finally { spec.clearPassword() }
    }
    fun verify(pin: String, encoded: String): Boolean = try {
        if (!pin.matches(Regex("[0-9]{6,12}"))) false else {
            val pieces = encoded.split(':')
            val salt = Base64.getDecoder().decode(pieces[0])
            val expected = Base64.getDecoder().decode(pieces[1])
            salt.size == 16 && expected.size == 32 && MessageDigest.isEqual(derive(pin, salt), expected)
        }
    } catch (_: Exception) { false }
}

data class User(val id: String, val matricula: String, val name: String) {
    var credentialVersion: Int = 1
    fun toJson() = obj("id" to id, "matricula" to matricula, "name" to name)
}
data class Session(val token: String, val user: User, val expiresAt: Instant, val credentialVersion: Int) {
    fun toJson() = obj("token" to token, "expiresAt" to expiresAt, "user" to user.toJson())
}
class Sessions {
    private val entries = ConcurrentHashMap<String, Session>()
    private val random = SecureRandom()
    @Synchronized fun create(user: User, version: Int): Session {
        entries.entries.removeIf { it.value.expiresAt <= Instant.now() }
        // Bounded LAN service: at most five remembered logins per account.
        entries.values.filter { it.user.id == user.id }.sortedBy { it.expiresAt }.dropLast(4).forEach { entries.remove(it.token) }
        val token = Base64.getUrlEncoder().withoutPadding().encodeToString(ByteArray(32).also(random::nextBytes))
        return Session(token, user, Instant.now().plusSeconds(86400), version).also { entries[token] = it }
    }
    fun get(token: String): Session = entries[token]?.takeIf { it.expiresAt > Instant.now() }
        ?: throw ApiError("UNAUTHENTICATED", "Inicia sesión nuevamente")
    fun remove(token: String) { entries.remove(token) }
}

class LoginLimiter {
    private data class Window(var started: Long, var attempts: Int)
    private val windows = HashMap<String, Window>()
    @Synchronized fun check(key: String, maximum: Int = 5) {
        val now = System.nanoTime()
        val duration = 15L * 60 * 1_000_000_000
        windows.entries.removeIf { now - it.value.started >= duration }
        if (windows.size >= 10000 && key !in windows) throw ApiError("RATE_LIMITED", "Intenta más tarde")
        val window = windows.getOrPut(key) { Window(now, 0) }
        if (window.attempts >= maximum) throw ApiError("RATE_LIMITED", "Demasiados intentos; espera 15 minutos")
        window.attempts++
    }
}
