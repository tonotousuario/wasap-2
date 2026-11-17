package wasap

import java.util.concurrent.TimeUnit
import kotlin.test.*
import org.junit.jupiter.api.Test

class SecurityTest {
    private class FakeClock { var now = 0L; fun advance(seconds: Long) { now += TimeUnit.SECONDS.toNanos(seconds) } }
    private val ana = User("u-ana", "A001", "Ana")

    @Test fun `credential version is queried at most once per five second window`() {
        val clock = FakeClock()
        val sessions = Sessions(clock = { clock.now })
        val session = sessions.create(ana, 1)
        var queries = 0
        val lookup = { _: String -> queries++; 1 }
        repeat(50) { sessions.validate(session, lookup) }
        assertEquals(0, queries, "fresh session needs no database read")
        clock.advance(5)
        repeat(50) { sessions.validate(session, lookup) }
        assertEquals(1, queries, "one read per window")
        clock.advance(4)
        sessions.validate(session, lookup)
        assertEquals(1, queries)
        clock.advance(1)
        sessions.validate(session, lookup)
        assertEquals(2, queries)
    }

    @Test fun `changed credential version revokes the session after the window`() {
        val clock = FakeClock()
        val sessions = Sessions(clock = { clock.now })
        val session = sessions.create(ana, 1)
        val changed = { _: String -> 2 }
        assertSame(session, sessions.validate(session, changed), "within the window the cached check holds")
        clock.advance(6)
        val error = assertFailsWith<ApiError> { sessions.validate(session, changed) }
        assertEquals("UNAUTHENTICATED", error.code)
        assertFalse(sessions.isLive(session))
        assertEquals("UNAUTHENTICATED", assertFailsWith<ApiError> { sessions.get(session.token) }.code)
    }

    @Test fun `successful logins never consume attempts`() {
        val limiter = LoginLimiter()
        repeat(6) { limiter.check("account:A001") } // six successful logins: check without fail
        assertEquals(0, limiter.size())
    }

    @Test fun `sixth failure in the window is rate limited and the window expires`() {
        val clock = FakeClock()
        val limiter = LoginLimiter(clock = { clock.now })
        repeat(5) { limiter.check("account:A001"); limiter.fail("account:A001") }
        assertEquals("RATE_LIMITED", assertFailsWith<ApiError> { limiter.check("account:A001") }.code)
        limiter.check("account:B001") // other accounts are unaffected
        clock.advance(15 * 60)
        limiter.check("account:A001")
    }

    @Test fun `a full table evicts the oldest window instead of rejecting new keys`() {
        val clock = FakeClock()
        val limiter = LoginLimiter(capacity = 3, clock = { clock.now })
        listOf("x", "y", "z").forEach { key -> repeat(5) { limiter.fail(key) }; clock.advance(1) }
        limiter.check("legit") // never seen: evaluated normally
        limiter.fail("legit")
        assertEquals(3, limiter.size())
        limiter.check("x") // oldest window was evicted to make room
        assertEquals("RATE_LIMITED", assertFailsWith<ApiError> { limiter.check("z") }.code)
    }

    @Test fun `removed sessions fail without a database read`() {
        val sessions = Sessions()
        val session = sessions.create(ana, 1)
        sessions.remove(session.token)
        assertEquals("UNAUTHENTICATED", assertFailsWith<ApiError> { sessions.validate(session, { fail("no lookup") }) }.code)
    }
}
