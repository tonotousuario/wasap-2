package wasap

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import kotlinx.serialization.json.*
import org.flywaydb.core.Flyway
import java.sql.Connection
import java.sql.Timestamp
import java.time.Instant
import java.time.OffsetDateTime

class Database(url: String, user: String, password: String, schema: String = "public", allowInsecure: Boolean = false, poolSize: Int = DEFAULT_DB_POOL_SIZE) : AutoCloseable {
    private val pool: HikariDataSource
    init {
        require(schema.matches(Regex("[a-z][a-z0-9_]{0,62}")))
        require(url.startsWith("jdbc:postgresql://")) { "DB_URL must use PostgreSQL JDBC" }
        if (!allowInsecure) require(Regex("[?&]sslmode=verify-full(?:&|$)").containsMatchIn(url)) { "DB_URL requires sslmode=verify-full" }
        pool = HikariDataSource(
            HikariConfig().apply {
                jdbcUrl = url
                username = user
                this.password = password
                maximumPoolSize = poolSize
                minimumIdle = 1
                connectionTimeout = 10000
                validationTimeout = 3000
                addDataSourceProperty("tcpKeepAlive", "true")
                addDataSourceProperty("connectTimeout", "10")
                addDataSourceProperty("socketTimeout", "20")
                connectionInitSql = "SET search_path TO $schema"
            },
        )
        try {
            Flyway.configure().dataSource(pool).schemas(schema).defaultSchema(schema).load().migrate()
        } catch (e: Exception) {
            pool.close()
            throw e
        }
    }
    fun <T> transaction(action: (Connection) -> T): T = pool.connection.use { c ->
        c.autoCommit = false
        try {
            action(c).also { c.commit() }
        } catch (e: Throwable) {
            c.rollback()
            throw e
        }
    }
    fun ready() = transaction { it.rows("SELECT 1 AS ok").isNotEmpty() }
    override fun close() = pool.close()
}

// SQLSTATE classes that may succeed on retry: connection (08), transaction rollback such as
// serialization failure or deadlock (40), insufficient resources (53), operator intervention or
// query cancellation (57).
private val transientSqlStateClasses = setOf("08", "40", "53", "57")

/** Database failures worth retrying with the same request id; anything else is deterministic. */
fun isTransientDatabaseFailure(error: Throwable): Boolean = sqlExceptions(error).any { e ->
    e is java.sql.SQLTransientException || e is java.sql.SQLRecoverableException ||
        e.sqlState?.take(2) in transientSqlStateClasses
}

/** SQLSTATE class of the first database failure in the chain, safe to log (no message text). */
fun sqlStateClass(error: Throwable): String? = sqlExceptions(error).firstNotNullOfOrNull { it.sqlState?.take(2) }

private fun sqlExceptions(error: Throwable): List<java.sql.SQLException> {
    val found = mutableListOf<java.sql.SQLException>()
    val seen = java.util.Collections.newSetFromMap(java.util.IdentityHashMap<Throwable, Boolean>())
    val pending = ArrayDeque<Throwable>().apply { add(error) }
    while (pending.isNotEmpty()) {
        val current = pending.removeFirst()
        if (!seen.add(current)) continue
        if (current is java.sql.SQLException) {
            found += current
            current.nextException?.let(pending::add)
        }
        current.cause?.let(pending::add)
    }
    return found
}

private fun Connection.statement(sql: String, params: Array<out Any?>) = prepareStatement(sql).also { s ->
    s.queryTimeout = 15
    params.forEachIndexed { i, value ->
        when (value) {
            is Instant -> s.setObject(i + 1, value.atOffset(java.time.ZoneOffset.UTC))
            else -> s.setObject(i + 1, value)
        }
    }
}
fun Connection.exec(sql: String, vararg params: Any?): Int = statement(sql, params).use { it.executeUpdate() }
fun Connection.rows(sql: String, vararg params: Any?): List<JsonObject> = statement(sql, params).use { s ->
    s.executeQuery().use { rs ->
        buildList {
            while (rs.next()) {
                add(
                    JsonObject(
                        (1..rs.metaData.columnCount).associate { i ->
                            val value = when (val raw = rs.getObject(i)) {
                                is Timestamp -> raw.toInstant().toString()
                                is OffsetDateTime -> raw.toInstant().toString()
                                else -> raw
                            }
                            rs.metaData.getColumnLabel(i) to json(value)
                        },
                    ),
                )
            }
        }
    }
}
