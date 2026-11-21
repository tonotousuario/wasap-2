package wasap

import kotlinx.serialization.json.*
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import java.sql.DriverManager
import java.util.UUID
import kotlin.test.*

/** Classes, per-class attendance and class reports (class-attendance-and-roles), at service level. */
@Tag("integration")
class ClassesTest {
    private lateinit var db: Database
    private lateinit var service: Service
    private lateinit var schema: String
    private lateinit var teacher: User
    private lateinit var ana: User
    private lateinit var beto: User
    private lateinit var admin: User
    private val url get() = requireNotNull(System.getenv("WASAP_TEST_DB_URL"))
    private val user get() = System.getenv("WASAP_TEST_DB_USER") ?: "wasap_test"
    private val password get() = System.getenv("WASAP_TEST_DB_PASSWORD") ?: "wasap_test"

    @BeforeEach fun setup() {
        schema = "test_" + UUID.randomUUID().toString().replace("-", "")
        db = Database(url, user, password, schema, allowInsecure = true)
        service = Service(db)
        teacher = service.createUser("PROF1", "Profesora Redes", "111111")
        ana = service.createUser("A001", "Ana", "123456")
        beto = service.createUser("B001", "Beto", "654321")
        admin = service.createUser("ADM", "Administración", "222222")
        service.setRole("PROF1", "teacher")
        service.setRole("ADM", "admin")
    }

    @AfterEach fun cleanup() {
        if (::db.isInitialized) db.close()
        DriverManager.getConnection(url, user, password).use { c -> c.createStatement().use { it.execute("DROP SCHEMA IF EXISTS $schema CASCADE") } }
    }

    private fun call(u: User, type: String, p: JsonObject = obj()) = service.call(u.id, type, p, UUID.randomUUID().toString())
    private fun createClass(owner: User, name: String, vararg matriculas: String) = call(owner, "groups.create", obj("name" to name, "matriculas" to matriculas.toList(), "class" to true))["conversation"]!!.jsonObject

    @Test fun `teachers and admins create classes and students cannot`() {
        val redes = createClass(teacher, "Redes 5.º A", "A001", "B001")
        assertTrue(redes["isClass"]!!.jsonPrimitive.boolean)
        assertEquals(teacher.id, redes.string("ownerId"))
        assertEquals(3, call(teacher, "groups.members", obj("conversationId" to redes.string("id")))["members"]!!.jsonArray.size)
        assertTrue(createClass(admin, "Cálculo", "A001")["isClass"]!!.jsonPrimitive.boolean)
        assertEquals("FORBIDDEN", assertFailsWith<ApiError> { createClass(ana, "Mi clase") }.code)
        val group = call(ana, "groups.create", obj("name" to "Amigos", "matriculas" to listOf("B001")))["conversation"]!!.jsonObject
        assertFalse(group["isClass"]!!.jsonPrimitive.boolean, "plain groups stay available to everyone")
    }

    @Test fun `a role change applies at once to class creation`() {
        assertEquals("FORBIDDEN", assertFailsWith<ApiError> { createClass(ana, "Taller") }.code)
        service.setRole("A001", "teacher")
        assertTrue(createClass(ana, "Taller")["isClass"]!!.jsonPrimitive.boolean)
    }

    @Test fun `classes list returns the user's classes and who owns them`() {
        val redes = createClass(teacher, "Redes", "A001", "B001")
        val calculo = createClass(admin, "Cálculo", "A001")
        call(ana, "groups.create", obj("name" to "Amigos", "matriculas" to listOf("B001")))
        val anaClasses = call(ana, "classes.list")["classes"]!!.jsonArray.map { it.jsonObject }
        assertEquals(listOf("Cálculo", "Redes"), anaClasses.map { it.string("name") })
        assertTrue(anaClasses.none { it["isOwner"]!!.jsonPrimitive.boolean })
        assertEquals(listOf(redes.string("id")), call(beto, "classes.list")["classes"]!!.jsonArray.map { it.jsonObject.string("id") })
        assertTrue(call(teacher, "classes.list")["classes"]!!.jsonArray.single().jsonObject["isOwner"]!!.jsonPrimitive.boolean)
        assertNotNull(calculo)
    }

    private fun mark(u: User, classId: String?, expected: String?) = call(
        u,
        "attendance.mark",
        JsonObject(mapOf("expectedLastEventId" to json(expected)) + (classId?.let { mapOf("classId" to json(it)) } ?: emptyMap())),
    )

    private fun state(u: User, classId: String? = null) = call(u, "attendance.state", if (classId == null) obj() else obj("classId" to classId))

    @Test fun `each class keeps its own in and out state, independent of the general door`() {
        val redes = createClass(teacher, "Redes", "A001").string("id")
        val calculo = createClass(teacher, "Cálculo", "A001").string("id")
        val entry = mark(ana, redes, null)["event"]!!.jsonObject
        assertEquals("ENTRY", entry.string("type"))
        assertEquals(redes, entry.string("classId"))
        assertEquals("EXIT", state(ana, redes).string("nextType"), "inside Redes")
        assertEquals("ENTRY", state(ana, calculo).string("nextType"), "still outside Cálculo")
        assertEquals("ENTRY", state(ana).string("nextType"), "the general door is untouched")
        assertEquals("EXIT", mark(ana, redes, entry.string("id"))["event"]!!.jsonObject.string("type"))
        assertEquals("CONFLICT", assertFailsWith<ApiError> { mark(ana, calculo, entry.string("id")) }.code, "expectations are per class")
    }

    @Test fun `members only, and only in real classes`() {
        val redes = createClass(teacher, "Redes", "A001").string("id")
        assertEquals("FORBIDDEN", assertFailsWith<ApiError> { mark(beto, redes, null) }.code)
        val group = call(ana, "groups.create", obj("name" to "Amigos", "matriculas" to listOf("B001")))["conversation"]!!.jsonObject.string("id")
        assertEquals("VALIDATION", assertFailsWith<ApiError> { mark(ana, group, null) }.code)
        assertEquals("NOT_FOUND", assertFailsWith<ApiError> { mark(ana, UUID.randomUUID().toString(), null) }.code)
    }

    @Test fun `clients without classId keep using the general door`() {
        val redes = createClass(teacher, "Redes", "A001").string("id")
        mark(ana, redes, null)
        val general = mark(ana, null, null)["event"]!!.jsonObject
        assertEquals("ENTRY", general.string("type"), "a class entry does not change the door")
        assertEquals(listOf(general.string("id")), call(ana, "attendance.list")["events"]!!.jsonArray.map { it.jsonObject.string("id") })
        assertEquals(1, call(ana, "attendance.list", obj("classId" to redes))["events"]!!.jsonArray.size)
    }

    @Test fun `removed students keep their past attendance in the class`() {
        val redes = createClass(teacher, "Redes", "A001", "B001").string("id")
        mark(beto, redes, null)
        call(teacher, "groups.remove", obj("conversationId" to redes, "matricula" to "B001"))
        assertEquals("FORBIDDEN", assertFailsWith<ApiError> { state(beto, redes) }.code)
        val kept = db.transaction { c -> c.rows("SELECT count(*) AS n FROM attendance_events WHERE class_id = ?::uuid", redes) }.single()
        assertEquals(1, kept["n"]!!.jsonPrimitive.int)
    }

    @Test fun `only the class owner or an admin reads the class report`() {
        val redes = createClass(teacher, "Redes", "A001", "B001").string("id")
        val other = service.createUser("PROF2", "Otro profesor", "333333").also { service.setRole("PROF2", "teacher") }
        mark(ana, redes, null)
        mark(beto, redes, null)
        mark(ana, null, null) // general door: not part of the class report
        val report = call(teacher, "attendance.classReport", obj("classId" to redes))["events"]!!.jsonArray.map { it.jsonObject }
        assertEquals(listOf("B001", "A001"), report.map { it.string("matricula") }, "newest first, both students")
        assertEquals(setOf("Ana", "Beto"), report.map { it.string("name") }.toSet())
        assertTrue(report.all { it.string("className") == "Redes" })
        assertEquals(2, call(admin, "attendance.classReport", obj("classId" to redes))["events"]!!.jsonArray.size)
        assertEquals("FORBIDDEN", assertFailsWith<ApiError> { call(ana, "attendance.classReport", obj("classId" to redes)) }.code)
        assertEquals("FORBIDDEN", assertFailsWith<ApiError> { call(other, "attendance.classReport", obj("classId" to redes)) }.code)
        assertEquals("NOT_FOUND", assertFailsWith<ApiError> { call(teacher, "attendance.classReport", obj("classId" to UUID.randomUUID().toString())) }.code)
    }

    @Test fun `the class report pages and filters by local date`() {
        val redes = createClass(teacher, "Redes", "A001").string("id")
        db.transaction { c ->
            listOf("2026-11-13T05:59:59Z", "2026-11-13T18:00:00Z", "2026-11-14T18:00:00Z").forEach { at ->
                c.exec("INSERT INTO attendance_events(id,user_id,type,class_id,recorded_at) VALUES (?::uuid,?::uuid,'ENTRY',?::uuid,?::timestamptz)", UUID.randomUUID().toString(), ana.id, redes, at)
            }
        }
        val day = call(teacher, "attendance.classReport", obj("classId" to redes, "from" to "2026-11-13", "to" to "2026-11-13"))
        assertEquals(listOf("2026-11-13T18:00:00Z"), day["events"]!!.jsonArray.map { it.jsonObject.string("recordedAt") }, "local day in Mexico City")
        val first = call(teacher, "attendance.classReport", obj("classId" to redes, "limit" to 2))
        assertEquals(2, first["events"]!!.jsonArray.size)
        val next = call(teacher, "attendance.classReport", obj("classId" to redes, "limit" to 2, "before" to first.string("nextCursor")))
        assertEquals(1, next["events"]!!.jsonArray.size)
        assertNull(next.optional("nextCursor"))
    }

    @Test fun `csv export lists every page with local times and neutralises formulas`() {
        val redes = createClass(teacher, "Redes, grupo \"A\"", "A001").string("id")
        service.createUser("Z001", "=SUMA(1)", "444444")
        db.transaction { c ->
            c.exec("INSERT INTO attendance_events(id,user_id,type,class_id,recorded_at) VALUES (?::uuid,?::uuid,'ENTRY',?::uuid,'2026-11-13T18:00:00Z')", UUID.randomUUID().toString(), ana.id, redes)
            c.exec("INSERT INTO attendance_events(id,user_id,type,recorded_at) SELECT ?::uuid, id, 'EXIT', '2026-11-13T19:30:00Z' FROM users WHERE matricula='Z001'", UUID.randomUUID().toString())
        }
        val all = service.attendanceCsv(null, obj("from" to "2026-11-13", "to" to "2026-11-13"))
        assertEquals(
            "matricula,nombre,clase,tipo,instante_local\n" +
                "Z001,'=SUMA(1),General,Salida,2026-11-13 13:30:00\n" +
                "A001,Ana,\"Redes, grupo \"\"A\"\"\",Entrada,2026-11-13 12:00:00\n",
            all,
        )
        val onlyClass = service.attendanceCsv(null, obj("classId" to redes)).lines().filter { it.isNotEmpty() }
        assertEquals(2, onlyClass.size, "header + one movement of the class")
        db.transaction { c ->
            repeat(150) { c.exec("INSERT INTO attendance_events(id,user_id,type) VALUES (?::uuid,?::uuid,'ENTRY')", UUID.randomUUID().toString(), beto.id) }
        }
        val pages = service.attendanceCsv("B001", obj()).lines().filter { it.isNotEmpty() }
        assertEquals(151, pages.size, "header + 150 movements across two pages of 100")
    }
}
