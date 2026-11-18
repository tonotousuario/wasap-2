package wasap

import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import java.sql.DriverManager
import java.util.UUID
import kotlin.test.*

/** Migrations applied over existing data (integration). */
@Tag("integration")
class MigrationTest {
    private val url get() = requireNotNull(System.getenv("WASAP_TEST_DB_URL"))
    private val user get() = System.getenv("WASAP_TEST_DB_USER") ?: "wasap_test"
    private val password get() = System.getenv("WASAP_TEST_DB_PASSWORD") ?: "wasap_test"

    @Test fun `classes and roles keep existing users as students and attendance in the general door`() {
        val schema = "test_" + UUID.randomUUID().toString().replace("-", "")
        try {
            Flyway.configure().dataSource(url, user, password).schemas(schema).defaultSchema(schema).target("4").load().migrate()
            DriverManager.getConnection(url, user, password).use { c ->
                c.createStatement().use { s ->
                    s.execute("SET search_path TO $schema")
                    s.execute("INSERT INTO users(id, matricula, name, pin_hash) VALUES ('11111111-1111-4111-8111-111111111111', 'A001', 'Ana', 'x')")
                    s.execute("INSERT INTO attendance_events(id, user_id, type) VALUES ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'ENTRY')")
                }
            }
            // Opening the database applies the remaining migrations, as the server does at startup.
            Database(url, user, password, schema, allowInsecure = true).use { db ->
                db.transaction { c ->
                    assertEquals("student", c.rows("SELECT role FROM users").single().string("role"))
                    assertTrue(c.rows("SELECT class_id FROM attendance_events").single()["class_id"].toString() == "null")
                    assertFalse(c.rows("SELECT bool_or(is_class) AS any FROM conversations").single()["any"].toString().toBoolean())
                }
            }
        } finally {
            DriverManager.getConnection(url, user, password).use { c -> c.createStatement().use { it.execute("DROP SCHEMA IF EXISTS $schema CASCADE") } }
        }
    }
}
