package wasap

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.locks.LockSupport
import kotlin.math.ceil
import kotlin.test.assertEquals
import kotlin.test.assertTrue

@Tag("load")
class SchoolLoadTest {
    private data class Operation(val client: Int, val type: String, val payload: JsonObject, val id: String = UUID.randomUUID().toString())
    private class Measurement(val sentAt: Long) {
        @Volatile var acknowledgedAt = 0L
        val deliveredWithinTwoSeconds = AtomicInteger()
    }

    private fun setting(name: String, default: Int, max: Int): Int {
        val raw = System.getenv(name) ?: return default
        return requireNotNull(raw.toIntOrNull()?.takeIf { it in 1..max }) { "$name must be an integer between 1 and $max" }
    }

    @Test fun `measure concurrent attendance and general chat over TLS`() {
        val connections = setting("LOAD_CONNECTIONS", 100, 3000)
        val seconds = setting("LOAD_SECONDS", 2, 60)
        val attendanceRate = setting("LOAD_ATTENDANCE_RATE", 50, 1000)
        val messageRate = setting("LOAD_MESSAGE_RATE", 5, 100)
        val attendanceCount = minOf(connections, seconds * attendanceRate)
        val messageCount = seconds * messageRate
        val url = requireNotNull(System.getenv("WASAP_TEST_DB_URL"))
        require(java.net.URI(url.removePrefix("jdbc:")).host in setOf("localhost", "127.0.0.1", "[::1]")) {
            "Use a disposable PostgreSQL database on localhost"
        }
        println("Requested: $connections TLS connections; $attendanceCount attendance marks at $attendanceRate/s; $messageCount messages at $messageRate/s")
        TestServer().use { env ->
            val tokens = List(connections) { UUID.randomUUID().toString() }
            val general = env.db.transaction { c ->
                tokens.forEachIndexed { i, token ->
                    val user = UUID.randomUUID().toString()
                    c.exec("INSERT INTO users(id,matricula,name,pin_hash) VALUES (?::uuid,?,?,?)", user, "LOAD$i", "Carga $i", "unused")
                    c.exec("INSERT INTO sessions(token_hash,user_id,credential_version,expires_at) VALUES (decode(?,'hex'),?::uuid,1,now()+interval '1 hour')", tokenHash(token), user)
                }
                c.rows("SELECT id::text FROM conversations WHERE kind='GENERAL'").single().string("id")
            }
            val opened = arrayOfNulls<TestServer.Client>(connections)
            try {
                val connectionStart = System.nanoTime()
                Executors.newFixedThreadPool(minOf(24, connections)).use { connectors ->
                    connectors.invokeAll(
                        tokens.mapIndexed { index, token ->
                            Callable {
                                val client = env.connect()
                                opened[index] = client
                                client.ok("auth.resume", obj("token" to token))
                                client.socket.soTimeout = 0
                            }
                        },
                    ).forEach { it.get() }
                }
                val clients = opened.map { checkNotNull(it) }
                println("Authenticated ${clients.size} sockets in ${TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - connectionStart)} ms")
                val marks = List(attendanceCount) { i -> Operation(i, "attendance.mark", obj("expectedLastEventId" to null)) }
                val messages = List(messageCount) { i -> Operation(i % connections, "messages.send", obj("conversationId" to general, "text" to "Carga $i")) }
                val scheduled = (
                    marks.mapIndexed { i, op -> TimeUnit.SECONDS.toNanos(1) * i / attendanceRate to op } +
                        messages.mapIndexed { i, op -> TimeUnit.SECONDS.toNanos(1) * i / messageRate to op }
                    ).sortedBy { it.first }
                val measurements = ConcurrentHashMap<String, Measurement>()
                val broadcasts = ConcurrentHashMap<String, Measurement>()
                val replies = CountDownLatch(scheduled.size)
                val errors = ConcurrentHashMap<String, AtomicInteger>()
                val replayed = CountDownLatch(2)
                val replayIds = setOf(marks.first().id, messages.first().id)
                val replayStarted = java.util.concurrent.atomic.AtomicBoolean()
                Executors.newVirtualThreadPerTaskExecutor().use { readers ->
                    try {
                        clients.forEach { client ->
                            readers.submit {
                                val seen = mutableSetOf<String>()
                                while (true) {
                                    val frame = Frames.read(client.socket.inputStream) ?: break
                                    val now = System.nanoTime()
                                    val payload = frame["payload"]!!.jsonObject
                                    when {
                                        frame.string("kind") == "response" -> {
                                            val id = frame.string("id")
                                            if (frame.string("type") != "success") errors.computeIfAbsent(payload.string("code")) { AtomicInteger() }.incrementAndGet()
                                            if (replayStarted.get() && id in replayIds) {
                                                replayed.countDown()
                                            } else {
                                                measurements.getValue(id).acknowledgedAt = now
                                                replies.countDown()
                                            }
                                        }
                                        frame.string("type") == "message.created" -> {
                                            val text = payload["message"]!!.jsonObject.string("text")
                                            val measurement = broadcasts.getValue(text)
                                            if (seen.add(text) && now - measurement.sentAt <= TimeUnit.SECONDS.toNanos(2)) {
                                                measurement.deliveredWithinTwoSeconds.incrementAndGet()
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        val start = System.nanoTime()
                        for ((delay, op) in scheduled) {
                            val deadline = start + delay
                            while (System.nanoTime() < deadline) LockSupport.parkNanos(deadline - System.nanoTime())
                            val measurement = Measurement(System.nanoTime())
                            measurements[op.id] = measurement
                            if (op.type == "messages.send") broadcasts[op.payload.string("text")] = measurement
                            clients[op.client].send(op.type, op.payload, op.id)
                        }
                        assertTrue(replies.await(20, TimeUnit.SECONDS), "Missing ${replies.count} responses; errors: $errors")
                        Thread.sleep(2000)
                        replayStarted.set(true)
                        listOf(marks.first(), messages.first()).forEach { clients[it.client].send(it.type, it.payload, it.id) }
                        assertTrue(replayed.await(5, TimeUnit.SECONDS), "Retried requests were not acknowledged")
                        println("Attendance p95: ${p95(marks, measurements)} ms; chat p95: ${p95(messages, measurements)} ms")
                        println("Minimum delivery per message within 2 s: ${broadcasts.values.minOf { it.deliveredWithinTwoSeconds.get() }}/$connections; errors: $errors")
                        assertTrue(errors.isEmpty(), errors.toString())
                    } finally {
                        clients.forEach { it.close() }
                    }
                }
                env.db.transaction { c ->
                    assertEquals(attendanceCount.toString(), c.rows("SELECT count(*)::text AS n FROM attendance_events").single().string("n"))
                    assertEquals(messageCount.toString(), c.rows("SELECT count(*)::text AS n FROM messages").single().string("n"))
                }
                println("PostgreSQL: $attendanceCount marks and $messageCount messages, including retries without duplicate rows")
            } finally {
                opened.forEach { it?.close() }
            }
        }
    }

    private fun p95(operations: List<Operation>, samples: Map<String, Measurement>): Double {
        val values = operations.map { op -> samples.getValue(op.id).let { it.acknowledgedAt - it.sentAt } }.sorted()
        return values[ceil(values.size * .95).toInt() - 1] / 1_000_000.0
    }
}
