package wasap

import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Instant
import java.util.Base64
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
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
class Session(val token: String, val user: User, val expiresAt: Instant, val credentialVersion: Int, validatedAt: Long) {
    /** Monotonic instant (Sessions clock) when credential_version was last confirmed in the database. */
    @Volatile internal var validatedAt: Long = validatedAt
    fun toJson() = obj("token" to token, "expiresAt" to expiresAt, "user" to user.toJson())
}

/**
 * In-memory sessions. Credential checks against the database are cached per session and
 * repeated at most once per [revalidateAfterNanos], so a PIN reset revokes sessions within
 * that bound without querying the database for every request, frame or event recipient.
 */
class Sessions(
    private val clock: () -> Long = System::nanoTime,
    private val revalidateAfterNanos: Long = TimeUnit.SECONDS.toNanos(5),
) {
    private val entries = ConcurrentHashMap<String, Session>()
    private val random = SecureRandom()
    @Synchronized fun create(user: User, version: Int): Session {
        entries.entries.removeIf { it.value.expiresAt <= Instant.now() }
        // Bounded LAN service: at most five remembered logins per account.
        entries.values.filter { it.user.id == user.id }.sortedBy { it.expiresAt }.dropLast(4).forEach { entries.remove(it.token) }
        val token = Base64.getUrlEncoder().withoutPadding().encodeToString(ByteArray(32).also(random::nextBytes))
        return Session(token, user, Instant.now().plusSeconds(86400), version, clock()).also { entries[token] = it }
    }
    fun get(token: String): Session = entries[token]?.takeIf(::isLive)
        ?: throw ApiError("UNAUTHENTICATED", "Inicia sesión nuevamente")
    fun remove(token: String) { entries.remove(token) }

    /** Cached validity without touching the database: still registered and not expired. */
    fun isLive(session: Session): Boolean = entries[session.token] === session && session.expiresAt > Instant.now()

    /**
     * Confirms [session] is still valid, consulting [currentVersion] (a database read) only when
     * the cached check is older than the revalidation interval or [force] is set (resuming a
     * stored token). Revoked sessions are removed.
     */
    fun validate(session: Session, currentVersion: (userId: String) -> Int, force: Boolean = false): Session {
        if (!isLive(session)) throw ApiError("UNAUTHENTICATED", "Inicia sesión nuevamente")
        if (!force && clock() - session.validatedAt < revalidateAfterNanos) return session
        synchronized(session) {
            val now = clock()
            if (!force && now - session.validatedAt < revalidateAfterNanos) return session
            if (currentVersion(session.user.id) != session.credentialVersion) {
                entries.remove(session.token, session)
                throw ApiError("UNAUTHENTICATED", "El PIN cambió; inicia sesión nuevamente")
            }
            session.validatedAt = now
        }
        return session
    }
}

/**
 * Counts failed logins per key in fixed 15-minute windows. Only failures count: call [check]
 * before verifying a PIN and [fail] after an invalid one. When full, the oldest window is
 * evicted so an attacker filling the table cannot lock out everyone else.
 */
class LoginLimiter(
    private val capacity: Int = 10000,
    private val clock: () -> Long = System::nanoTime,
    private val windowNanos: Long = TimeUnit.MINUTES.toNanos(15),
) {
    private class Window(val started: Long, var failures: Int)
    // Insertion order equals start order because a window is only created on its first failure.
    private val windows = LinkedHashMap<String, Window>()

    @Synchronized fun check(key: String, maximum: Int = 5) {
        prune()
        if ((windows[key]?.failures ?: 0) >= maximum) throw ApiError("RATE_LIMITED", "Demasiados intentos; espera 15 minutos")
    }

    @Synchronized fun fail(key: String) {
        prune()
        val window = windows[key] ?: Window(clock(), 0).also {
            if (windows.size >= capacity) windows.remove(windows.keys.first())
            windows[key] = it
        }
        window.failures++
    }

    @Synchronized fun size(): Int = windows.size

    private fun prune() {
        val now = clock()
        val iterator = windows.values.iterator()
        while (iterator.hasNext() && now - iterator.next().started >= windowNanos) iterator.remove()
    }
}
