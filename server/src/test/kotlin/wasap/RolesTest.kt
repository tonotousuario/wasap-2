package wasap

import kotlinx.serialization.json.*
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import java.util.concurrent.TimeUnit
import kotlin.test.*

/** Roles over real TLS sockets and PostgreSQL (class-attendance-and-roles 1.2). */
@Tag("integration")
class RolesTest {
    private var clock = 0L
    private lateinit var env: TestServer

    @BeforeEach fun setup() {
        env = TestServer(clock = { clock })
        env.service.createUser("ADM", "Administración", "111111")
        env.service.createUser("A001", "Ana", "123456")
        env.service.setRole("ADM", "admin")
    }

    @AfterEach fun cleanup() {
        if (::env.isInitialized) env.close()
    }

    @Test fun `new users are students and the role travels with the session`() {
        env.connect().use { ana ->
            val login = ana.login("A001", "123456")
            assertEquals("student", login["user"]!!.jsonObject.string("role"))
            val token = login.string("token")
            env.service.setRole("A001", "teacher")
            clock += TimeUnit.SECONDS.toNanos(6) // revalidation picks the new role up
            assertEquals("success", ana.request("attendance.state").string("type"))
            env.connect().use { other ->
                assertEquals("teacher", other.ok("auth.resume", obj("token" to token))["user"]!!.jsonObject.string("role"))
            }
        }
    }

    @Test fun `only an admin changes roles`() {
        env.connect().use { ana ->
            ana.login("A001", "123456")
            assertEquals("FORBIDDEN", ana.errorCode("users.setRole", obj("matricula" to "A001", "role" to "admin")))
        }
        env.connect().use { admin ->
            admin.login("ADM", "111111")
            val user = admin.ok("users.setRole", obj("matricula" to "a001", "role" to "teacher"))["user"]!!.jsonObject
            assertEquals(obj("id" to user.string("id"), "matricula" to "A001", "name" to "Ana", "role" to "teacher"), user)
            assertEquals("VALIDATION", admin.errorCode("users.setRole", obj("matricula" to "A001", "role" to "rector")))
            assertEquals("NOT_FOUND", admin.errorCode("users.setRole", obj("matricula" to "Z999", "role" to "teacher")))
        }
    }

    @Test fun `the directory never exposes roles`() {
        env.connect().use { ana ->
            ana.login("A001", "123456")
            val users = ana.ok("users.list", obj("query" to "ana"))["users"]!!.jsonArray.map { it.jsonObject }
            assertTrue(users.all { "role" !in it })
        }
    }

    @Test fun `class attendance events carry their class`() {
        env.service.setRole("A001", "teacher")
        env.connect().use { ana ->
            ana.login("A001", "123456")
            val redes = ana.ok("groups.create", obj("name" to "Redes", "matriculas" to emptyList<String>(), "class" to true))["conversation"]!!.jsonObject.string("id")
            ana.ok("attendance.mark", obj("expectedLastEventId" to null, "classId" to redes))
            ana.ok("ping")
            val changed = ana.events.last { it.string("type") == "attendance.changed" }["payload"]!!.jsonObject
            assertEquals(redes, changed.string("classId"))
            assertEquals("EXIT", changed.string("nextType"))
        }
    }
}
