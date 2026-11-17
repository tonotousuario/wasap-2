package wasap

import org.junit.jupiter.api.Test
import java.util.concurrent.TimeUnit
import kotlin.test.*

class SecurityTest {
    private class FakeClock {
        var now = 0L
        fun advance(seconds: Long) {
            now += TimeUnit.SECONDS.toNanos(seconds)
        }
    }
    private val ana = User("u-ana", "A001", "Ana")

    /** In-memory SessionStore that counts validity checks. */
    private class FakeStore : SessionStore {
        val rows = mutableMapOf<String, StoredSession>()
        var validityChecks = 0
        var currentVersion = 1
        override fun insert(hash: String, user: User, credentialVersion: Int, expiresAt: java.time.Instant, keep: Int): List<String> {
            val surplus = rows.filterValues { it.user.id == user.id }.entries.sortedByDescending { it.value.expiresAt }.drop(keep - 1).map { it.key }
            surplus.forEach(rows::remove)
            rows[hash] = StoredSession(user, credentialVersion, expiresAt)
            return surplus
        }
        override fun find(hash: String) = rows[hash]?.takeIf { it.credentialVersion == currentVersion }
        override fun isValid(hash: String, credentialVersion: Int): Boolean {
            validityChecks++
            return rows[hash] != null && credentialVersion == currentVersion
        }
        override fun delete(hash: String) {
            rows.remove(hash)
        }
        override fun purgeExpired() = 0
    }

    @Test fun `the store is checked at most once per five second window`() {
        val clock = FakeClock()
        val store = FakeStore()
        val sessions = Sessions(store, clock = { clock.now })
        val session = sessions.create(ana, 1)
        repeat(50) { sessions.validate(session) }
        assertEquals(0, store.validityChecks, "fresh session needs no database read")
        clock.advance(5)
        repeat(50) { sessions.validate(session) }
        assertEquals(1, store.validityChecks, "one read per window")
        clock.advance(4)
        sessions.validate(session)
        assertEquals(1, store.validityChecks)
        clock.advance(1)
        sessions.validate(session)
        assertEquals(2, store.validityChecks)
        sessions.validate(session, force = true)
        assertEquals(3, store.validityChecks, "resume always rechecks")
    }

    @Test fun `revoked sessions stop validating after the window`() {
        val clock = FakeClock()
        val store = FakeStore()
        val sessions = Sessions(store, clock = { clock.now })
        val session = sessions.create(ana, 1)
        store.currentVersion = 2 // PIN reset
        assertSame(session, sessions.validate(session), "within the window the cached check holds")
        clock.advance(6)
        assertEquals("UNAUTHENTICATED", assertFailsWith<ApiError> { sessions.validate(session) }.code)
        assertFalse(sessions.isLive(session))
        assertTrue(store.rows.isEmpty(), "the stale row is deleted")
    }

    @Test fun `a new Sessions instance resumes stored tokens and the sixth login evicts the oldest`() {
        val store = FakeStore()
        val first = Sessions(store)
        val tokens = (1..6).map { first.create(ana, 1).token }
        assertEquals(5, store.rows.size)
        assertFalse(store.rows.containsKey(tokens.first().let(::tokenHash)), "soonest to expire was evicted")
        assertTrue(store.rows.keys.none { key -> tokens.any { it == key } }, "only hashes are stored")
        val restarted = Sessions(store) // empty memory, same store
        assertEquals(ana, restarted.get(tokens.last()).user)
        assertEquals("UNAUTHENTICATED", assertFailsWith<ApiError> { restarted.get(tokens.first()) }.code)
    }

    @Test fun `successful logins never consume attempts`() {
        val limiter = LoginLimiter()
        repeat(6) { limiter.check("account:A001") } // six successful logins: check without fail
        assertEquals(0, limiter.size())
    }

    @Test fun `sixth failure in the window is rate limited and the window expires`() {
        val clock = FakeClock()
        val limiter = LoginLimiter(clock = { clock.now })
        repeat(5) {
            limiter.check("account:A001")
            limiter.fail("account:A001")
        }
        assertEquals("RATE_LIMITED", assertFailsWith<ApiError> { limiter.check("account:A001") }.code)
        limiter.check("account:B001") // other accounts are unaffected
        clock.advance(15 * 60)
        limiter.check("account:A001")
    }

    @Test fun `a full table evicts the oldest window instead of rejecting new keys`() {
        val clock = FakeClock()
        val limiter = LoginLimiter(capacity = 3, clock = { clock.now })
        listOf("x", "y", "z").forEach { key ->
            repeat(5) { limiter.fail(key) }
            clock.advance(1)
        }
        limiter.check("legit") // never seen: evaluated normally
        limiter.fail("legit")
        assertEquals(3, limiter.size())
        limiter.check("x") // oldest window was evicted to make room
        assertEquals("RATE_LIMITED", assertFailsWith<ApiError> { limiter.check("z") }.code)
    }

    @Test fun `removed sessions fail without a database read`() {
        val store = FakeStore()
        val sessions = Sessions(store)
        val session = sessions.create(ana, 1)
        sessions.remove(session.token)
        assertEquals("UNAUTHENTICATED", assertFailsWith<ApiError> { sessions.validate(session) }.code)
        assertEquals(0, store.validityChecks)
    }
}
