package wasap

import kotlinx.serialization.json.*
import java.io.*
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.util.UUID

class ApiError(
    val code: String,
    override val message: String,
    /** Extra fields added to the error payload next to code and message. */
    val details: JsonObject = JsonObject(emptyMap()),
) : RuntimeException(message)
fun invalid(message: String): Nothing = throw ApiError("VALIDATION", message)
fun json(value: Any?): JsonElement = when (value) {
    null -> JsonNull
    is JsonElement -> value
    is Boolean -> JsonPrimitive(value)
    is Number -> JsonPrimitive(value)
    is Iterable<*> -> JsonArray(value.map(::json))
    else -> JsonPrimitive(value.toString())
}
fun obj(vararg fields: Pair<String, Any?>) = JsonObject(fields.associate { it.first to json(it.second) })
fun JsonObject.string(key: String): String = (get(key) as? JsonPrimitive)?.takeIf { it.isString }?.content
    ?: invalid("Se requiere $key como texto")
fun JsonObject.optional(key: String): String? = if (get(key) == null || get(key) == JsonNull) null else string(key)
fun uuid(value: String): String = try {
    UUID.fromString(value).toString().also { if (it != value.lowercase()) invalid("UUID inválido") }
} catch (_: IllegalArgumentException) {
    invalid("UUID inválido")
}
fun JsonObject.uuid(key: String): String = wasap.uuid(string(key))
fun JsonObject.limit(): Int {
    val value = get("limit") ?: return 50
    return (value as? JsonPrimitive)?.takeUnless { it.isString }?.intOrNull?.takeIf { it in 1..100 }
        ?: invalid("limit debe estar entre 1 y 100")
}
fun JsonObject.cursor(key: String): Long? = optional(key)?.let { it.toLongOrNull()?.takeIf { n -> n >= 0 } ?: invalid("Cursor inválido") }

object Frames {
    private const val MAX = 65536
    fun read(input: InputStream): JsonObject? {
        val first = input.read()
        if (first == -1) return null
        val data = DataInputStream(input)
        val length = (first shl 24) or (data.readUnsignedByte() shl 16) or
            (data.readUnsignedByte() shl 8) or data.readUnsignedByte()
        require(length in 1..MAX) { "Invalid frame length" }
        val bytes = ByteArray(length)
        data.readFully(bytes)
        val text = Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString()
        return Json.parseToJsonElement(text) as? JsonObject ?: error("Frame must be a JSON object")
    }
    fun write(output: OutputStream, value: JsonObject) {
        val bytes = value.toString().toByteArray(Charsets.UTF_8)
        require(bytes.size in 1..MAX) { "Frame too large" }
        // One write, so header and body travel in a single TLS record; two small writes would
        // interact with Nagle's algorithm and delayed ACKs and add ~40 ms per frame.
        val framed = ByteBuffer.allocate(4 + bytes.size).putInt(bytes.size).put(bytes).array()
        output.write(framed)
        output.flush()
    }
}
