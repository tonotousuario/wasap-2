package wasap

import java.sql.DriverManager
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import kotlinx.serialization.json.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.AfterEach
import kotlin.test.*

@Tag("integration")
class ServiceTest {
    private lateinit var db: Database
    private lateinit var service: Service
    private lateinit var schema: String
    private lateinit var a: User
    private lateinit var b: User
    private lateinit var outsider: User
    private val url get() = requireNotNull(System.getenv("WASAP_TEST_DB_URL")) { "Set WASAP_TEST_DB_URL to a disposable PostgreSQL database" }
    private val user get() = System.getenv("WASAP_TEST_DB_USER") ?: "wasap_test"
    private val password get() = System.getenv("WASAP_TEST_DB_PASSWORD") ?: "wasap_test"

    @BeforeEach fun setup() {
        schema = "test_" + UUID.randomUUID().toString().replace("-", "")
        db = Database(url, user, password, schema, allowInsecure = true)
        service = Service(db)
        a = service.createUser("A001", "Ana", "123456")
        b = service.createUser("B001", "Beto", "654321")
        outsider = service.createUser("C001", "Caro", "111111")
    }
    @AfterEach fun cleanup() {
        if (::db.isInitialized) db.close()
        DriverManager.getConnection(url, user, password).use { c -> c.createStatement().use { it.execute("DROP SCHEMA IF EXISTS $schema CASCADE") } }
    }
    private fun call(u: User, type: String, p: JsonObject = obj(), id: String = UUID.randomUUID().toString()) = service.call(u.id, type, p, id)

    @Test fun `attendance retries survive service restart and cannot toggle twice`() {
        val id = UUID.randomUUID().toString()
        val p = obj("expectedLastEventId" to null)
        val first = call(a, "attendance.mark", p, id)
        service = Service(db)
        assertEquals(first, call(a, "attendance.mark", p, id))
        assertEquals("ENTRY", first["event"]!!.jsonObject.string("type"))
        val eid = first["event"]!!.jsonObject.string("id")
        assertEquals("EXIT", call(a, "attendance.mark", obj("expectedLastEventId" to eid))["event"]!!.jsonObject.string("type"))
        val rows = call(a, "attendance.list")["events"]!!.jsonArray
        assertEquals(2, rows.size)
        assertEquals("EXIT", rows[0].jsonObject.string("type"))
        assertEquals("REQUEST_ID_REUSED", assertFailsWith<ApiError> { call(a, "attendance.mark", obj("expectedLastEventId" to eid), id) }.code)
    }

    @Test fun `concurrent stale attendance requests produce exactly one movement`() {
        val gate = CyclicBarrier(2)
        Executors.newVirtualThreadPerTaskExecutor().use { pool ->
            val results = (1..2).map { pool.submit<String> {
                gate.await()
                try { call(a, "attendance.mark", obj("expectedLastEventId" to null)); "OK" }
                catch (e: ApiError) { e.code }
            } }.map { it.get() }.sorted()
            assertEquals(listOf("CONFLICT", "OK"), results)
        }
        assertEquals(1, call(a, "attendance.list")["events"]!!.jsonArray.size)
    }

    @Test fun `attendance alternation crosses midnight and histories are private`() {
        val first = call(a, "attendance.mark", obj("expectedLastEventId" to null))["event"]!!.jsonObject
        db.transaction { c -> c.exec("UPDATE attendance_events SET recorded_at = '2026-11-11T23:00:00Z' WHERE user_id = ?::uuid", a.id) }
        val next = call(a, "attendance.mark", obj("expectedLastEventId" to first.string("id")))
        assertEquals("EXIT", next["event"]!!.jsonObject.string("type"))
        assertTrue(call(b, "attendance.list")["events"]!!.jsonArray.isEmpty())
    }

    @Test fun `direct conversations are unique and private`() {
        val direct = call(a, "conversations.direct", obj("matricula" to "B001"))["conversation"]!!.jsonObject
        assertEquals(obj("id" to b.id, "matricula" to "B001", "name" to "Beto"), direct["peer"])
        assertEquals(direct.string("id"), call(b, "conversations.direct", obj("matricula" to "A001"))["conversation"]!!.jsonObject.string("id"))
        val ownList = call(b, "conversations.list")["conversations"]!!.jsonArray.map { it.jsonObject }
        assertEquals(obj("id" to a.id, "matricula" to "A001", "name" to "Ana"), ownList.single { it.string("id") == direct.string("id") }["peer"])
        assertTrue(ownList.filter { it.string("kind") != "DIRECT" }.all { "peer" !in it })
        assertFalse(call(outsider, "conversations.list")["conversations"]!!.jsonArray.any { it.jsonObject.string("id") == direct.string("id") })
        assertEquals("FORBIDDEN", assertFailsWith<ApiError> { call(outsider, "messages.list", obj("conversationId" to direct.string("id"))) }.code)
        assertEquals("FORBIDDEN", assertFailsWith<ApiError> { call(outsider, "messages.send", obj("conversationId" to direct.string("id"), "text" to "no")) }.code)
    }

    @Test fun `attendance calendar uses configured zone and inclusive local day boundaries`() {
        val zone = ZoneId.of("America/Mexico_City")
        val before = LocalDate.now(zone).toString()
        val state = call(a, "attendance.state")
        assertEquals(zone.id, state.string("timezone"))
        assertTrue(state.string("today") in setOf(before, LocalDate.now(zone).toString()))
        val instants = listOf("2026-11-13T05:59:59.999Z", "2026-11-13T06:00:00Z", "2026-11-14T05:59:59.999Z", "2026-11-14T06:00:00Z")
        db.transaction { c -> instants.forEach { instant ->
            c.exec("INSERT INTO attendance_events(id,user_id,type,recorded_at) VALUES (?::uuid,?::uuid,'ENTRY',?::timestamptz)", UUID.randomUUID().toString(), a.id, instant)
        } }
        val filtered = call(a, "attendance.list", obj("from" to "2026-11-13", "to" to "2026-11-13", "limit" to 1))
        assertEquals(listOf("2026-11-14T05:59:59.999Z"), filtered["events"]!!.jsonArray.map { it.jsonObject.string("recordedAt") })
        val older = call(a, "attendance.list", obj("from" to "2026-11-13", "to" to "2026-11-13", "before" to filtered.string("nextCursor")))
        assertEquals(listOf("2026-11-13T06:00:00Z"), older["events"]!!.jsonArray.map { it.jsonObject.string("recordedAt") })
        assertNull(older.optional("nextCursor"))
        assertTrue(call(b, "attendance.list", obj("from" to "2026-11-13", "to" to "2026-11-13"))["events"]!!.jsonArray.isEmpty())
    }

    @Test fun `group owner controls membership and removing member denies reads writes and delivery`() {
        val group = call(a, "groups.create", obj("name" to "Clase", "matriculas" to listOf("B001")))["conversation"]!!.jsonObject.string("id")
        assertEquals("FORBIDDEN", assertFailsWith<ApiError> { call(b, "groups.add", obj("conversationId" to group, "matricula" to "C001")) }.code)
        call(a, "messages.send", obj("conversationId" to group, "text" to "Hola"))
        assertEquals(1, call(b, "messages.list", obj("conversationId" to group))["messages"]!!.jsonArray.size)
        call(a, "groups.remove", obj("conversationId" to group, "matricula" to "B001"))
        assertFalse(service.canAccess(b.id, group))
        assertEquals("FORBIDDEN", assertFailsWith<ApiError> { call(b, "messages.list", obj("conversationId" to group)) }.code)
        assertEquals("FORBIDDEN", assertFailsWith<ApiError> { call(b, "messages.send", obj("conversationId" to group, "text" to "No")) }.code)
        assertEquals("VALIDATION", assertFailsWith<ApiError> { call(a, "groups.remove", obj("conversationId" to group, "matricula" to "A001")) }.code)
    }

    @Test fun `message retry and forward backward pagination preserve exact committed sequence`() {
        val cid = call(a, "conversations.list")["conversations"]!!.jsonArray.first().jsonObject.string("id")
        val id = UUID.randomUUID().toString()
        val payload = obj("conversationId" to cid, "text" to "uno")
        assertEquals(call(a, "messages.send", payload, id), call(a, "messages.send", payload, id))
        listOf("dos", "tres", "cuatro").forEach { call(b, "messages.send", obj("conversationId" to cid, "text" to it)) }
        val latest = call(a, "messages.list", obj("conversationId" to cid, "limit" to 2))
        assertEquals(listOf("tres", "cuatro"), latest["messages"]!!.jsonArray.map { it.jsonObject.string("text") })
        val older = call(a, "messages.list", obj("conversationId" to cid, "before" to latest.string("nextCursor"), "limit" to 2))
        assertEquals(listOf("uno", "dos"), older["messages"]!!.jsonArray.map { it.jsonObject.string("text") })
        val unseen = call(a, "messages.list", obj("conversationId" to cid, "after" to "1", "limit" to 2))
        assertEquals(listOf("dos", "tres"), unseen["messages"]!!.jsonArray.map { it.jsonObject.string("text") })
        assertEquals("3", unseen.string("nextCursor"))
    }

    @Test fun `credentials are checked without exposing pin hashes in directory`() {
        assertEquals(a, service.authenticate("a001", "123456"))
        assertEquals("INVALID_CREDENTIALS", assertFailsWith<ApiError> { service.authenticate("A001", "000000") }.code)
        val directory = call(a, "users.list").toString()
        assertFalse(directory.contains("pin"))
        service.resetPin("A001", "121212")
        assertFailsWith<ApiError> { service.authenticate("A001", "123456") }
        assertEquals(a, service.authenticate("A001", "121212"))
    }

    @Test fun `history pages fit a wire frame even with maximum unicode messages`() {
        val cid = call(a, "conversations.list")["conversations"]!!.jsonArray.first().jsonObject.string("id")
        repeat(8) { call(a, "messages.send", obj("conversationId" to cid, "text" to "界".repeat(4000))) }
        var cursor: String? = "0"
        var count = 0
        while (cursor != null) {
            val page = call(a, "messages.list", obj("conversationId" to cid, "after" to cursor, "limit" to 100))
            assertTrue(page.toString().toByteArray().size < 64000, "history exceeds frame size")
            count += page["messages"]!!.jsonArray.size
            cursor = page.optional("nextCursor")
        }
        assertEquals(8, count)
    }

    @Test fun `conversation directory paginates without dropping groups`() {
        repeat(3) { call(a, "groups.create", obj("name" to "Grupo $it", "matriculas" to emptyList<String>())) }
        val first = call(a, "conversations.list", obj("limit" to 2))
        assertEquals(2, first["conversations"]!!.jsonArray.size)
        val second = call(a, "conversations.list", obj("limit" to 2, "after" to first.string("nextCursor")))
        assertEquals(2, second["conversations"]!!.jsonArray.size)
        assertNull(second.optional("nextCursor"))
        assertEquals(4, (first["conversations"]!!.jsonArray + second["conversations"]!!.jsonArray).map { it.jsonObject.string("id") }.toSet().size)
    }

    @Test fun `direct peer directory fits wire frames and preserves UUID cursors`() {
        repeat(100) { index ->
            val matricula = "P$index"
            db.transaction { c -> c.exec("INSERT INTO users(id,matricula,name,pin_hash) SELECT ?::uuid,?,?,pin_hash FROM users WHERE id=?::uuid", UUID.randomUUID().toString(), matricula, "界".repeat(120), a.id) }
            call(a, "conversations.direct", obj("matricula" to matricula))
        }
        var cursor: String? = null
        val ids = mutableListOf<String>()
        do {
            val page = call(a, "conversations.list", if (cursor == null) obj("limit" to 100) else obj("limit" to 100, "after" to cursor))
            val frame = obj("v" to 1, "kind" to "response", "id" to UUID.randomUUID().toString(), "type" to "success", "payload" to page)
            assertTrue(frame.toString().toByteArray(Charsets.UTF_8).size < 65536)
            page["conversations"]!!.jsonArray.forEach { item ->
                val conversation = item.jsonObject
                ids.add(conversation.string("id"))
                if (conversation.string("kind") == "DIRECT") assertEquals("界".repeat(120), conversation["peer"]!!.jsonObject.string("name"))
            }
            cursor = page.optional("nextCursor")
        } while (cursor != null)
        assertEquals(101, ids.size)
        assertEquals(ids.distinct().sorted(), ids)
    }

    @Test fun `protected delivery linearizes with removal and drops queued revoked content`() {
        val cid = call(a, "groups.create", obj("name" to "Clase", "matriculas" to listOf("B001")))["conversation"]!!.jsonObject.string("id")
        val writing = CountDownLatch(1)
        val finish = CountDownLatch(1)
        Executors.newVirtualThreadPerTaskExecutor().use { pool ->
            val delivery = pool.submit<Boolean> { service.withConversationAccess(b.id, cid) {
                writing.countDown()
                check(finish.await(5, TimeUnit.SECONDS))
            } }
            assertTrue(writing.await(5, TimeUnit.SECONDS))
            val removal = pool.submit { call(a, "groups.remove", obj("conversationId" to cid, "matricula" to "B001")) }
            try { assertFailsWith<TimeoutException> { removal.get(300, TimeUnit.MILLISECONDS) } }
            finally { finish.countDown() }
            assertTrue(delivery.get(5, TimeUnit.SECONDS))
            removal.get(5, TimeUnit.SECONDS)
            var delivered = false
            assertFalse(service.withConversationAccess(b.id, cid) { delivered = true })
            assertFalse(delivered)
        }
    }
}
