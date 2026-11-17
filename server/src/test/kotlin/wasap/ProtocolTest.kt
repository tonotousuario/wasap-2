package wasap

import kotlinx.serialization.json.*
import org.junit.jupiter.api.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.FilterInputStream
import java.nio.ByteBuffer
import kotlin.test.*

class ProtocolTest {
    @Test fun `frames survive split bytes and concatenation including unicode`() {
        val out = ByteArrayOutputStream()
        Frames.write(out, obj("text" to "¡Hola 👋!"))
        Frames.write(out, obj("text" to "second"))
        val input = object : FilterInputStream(ByteArrayInputStream(out.toByteArray())) {
            override fun read(b: ByteArray, off: Int, len: Int) = super.read(b, off, minOf(1, len))
        }
        assertEquals("¡Hola 👋!", Frames.read(input)!!.string("text"))
        assertEquals("second", Frames.read(input)!!.string("text"))
        assertNull(Frames.read(input))
    }

    @Test fun `invalid lengths truncated bodies malformed json and invalid utf8 fail closed`() {
        listOf(0, -1, 65537).forEach { size ->
            assertFails { Frames.read(ByteArrayInputStream(ByteBuffer.allocate(4).putInt(size).array())) }
        }
        assertFails { Frames.read(ByteArrayInputStream(byteArrayOf(0, 0))) }
        assertFails { Frames.read(ByteArrayInputStream(byteArrayOf(0, 0, 0, 2, 123))) }
        assertFails { Frames.read(ByteArrayInputStream(byteArrayOf(0, 0, 0, 1, 91))) }
        assertFails { Frames.read(ByteArrayInputStream(byteArrayOf(0, 0, 0, 2, 0xc3.toByte(), 0x28))) }
    }

    @Test fun `database failures are transient only for retryable sqlstate classes`() {
        fun sql(state: String?) = java.sql.SQLException("detalle interno", state)
        listOf("08001", "08006", "40001", "40P01", "53300", "57014", "57P01").forEach { state ->
            assertTrue(isTransientDatabaseFailure(sql(state)), state)
        }
        listOf("23505", "22P05", "42601", null).forEach { state ->
            assertFalse(isTransientDatabaseFailure(sql(state)), state.toString())
        }
        assertTrue(isTransientDatabaseFailure(java.sql.SQLTransientConnectionException("pool timeout")))
        assertTrue(isTransientDatabaseFailure(RuntimeException(sql("08003"))), "cause chain")
        assertTrue(isTransientDatabaseFailure(sql("23505").apply { nextException = sql("40001") }), "next exception")
        assertEquals("22", sqlStateClass(RuntimeException(sql("22P05"))))
        assertNull(sqlStateClass(IllegalStateException("x")))
    }

    @Test fun `processed request retention defaults to 30 days and rejects invalid values`() {
        assertEquals(30, retentionDays(null))
        assertEquals(30, retentionDays(" "))
        assertEquals(7, retentionDays(" 7 "))
        listOf("0", "-3", "abc", "1.5").forEach { assertEquals("VALIDATION", assertFailsWith<ApiError> { retentionDays(it) }.code, it) }
    }

    @Test fun `pin hashes are salted verified and reject malformed input`() {
        val hash = Pins.hash("123456")
        assertNotEquals(hash, Pins.hash("123456"))
        assertTrue(Pins.verify("123456", hash))
        assertFalse(Pins.verify("123457", hash))
        assertFalse(Pins.verify("123456", "broken"))
        assertFails { Pins.hash("123") }
        assertFails { Pins.hash("abcdef") }
    }
}
