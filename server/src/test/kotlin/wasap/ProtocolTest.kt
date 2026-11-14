package wasap

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.FilterInputStream
import java.nio.ByteBuffer
import kotlinx.serialization.json.*
import kotlin.test.*
import org.junit.jupiter.api.Test

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
        assertFails { Frames.read(ByteArrayInputStream(byteArrayOf(0,0,0,2,123))) }
        assertFails { Frames.read(ByteArrayInputStream(byteArrayOf(0,0,0,1,91))) }
        assertFails { Frames.read(ByteArrayInputStream(byteArrayOf(0,0,0,2,0xc3.toByte(),0x28))) }
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
