package wasap

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import java.sql.Connection
import java.sql.Timestamp
import java.time.Instant
import java.time.OffsetDateTime
import kotlinx.serialization.json.*
import org.flywaydb.core.Flyway

class Database(url: String, user: String, password: String, schema: String = "public", allowInsecure: Boolean = false) : AutoCloseable {
    private val pool: HikariDataSource
    init {
        require(schema.matches(Regex("[a-z][a-z0-9_]{0,62}")))
        require(url.startsWith("jdbc:postgresql://")) { "DB_URL must use PostgreSQL JDBC" }
        if (!allowInsecure) require(Regex("[?&]sslmode=verify-full(?:&|$)").containsMatchIn(url)) { "DB_URL requires sslmode=verify-full" }
        pool = HikariDataSource(HikariConfig().apply {
            jdbcUrl = url; username = user; this.password = password
            maximumPoolSize = 5; minimumIdle = 1
            connectionTimeout = 10000; validationTimeout = 3000
            addDataSourceProperty("tcpKeepAlive", "true")
            addDataSourceProperty("connectTimeout", "10")
            addDataSourceProperty("socketTimeout", "20")
            connectionInitSql = "SET search_path TO $schema"
        })
        try {
            Flyway.configure().dataSource(pool).schemas(schema).defaultSchema(schema).load().migrate()
        } catch (e: Exception) { pool.close(); throw e }
    }
    fun <T> transaction(action: (Connection) -> T): T = pool.connection.use { c ->
        c.autoCommit = false
        try { action(c).also { c.commit() } } catch (e: Throwable) { c.rollback(); throw e }
    }
    fun ready() = transaction { it.rows("SELECT 1 AS ok").isNotEmpty() }
    override fun close() = pool.close()
}

private fun Connection.statement(sql: String, params: Array<out Any?>) = prepareStatement(sql).also { s ->
    s.queryTimeout = 15
    params.forEachIndexed { i, value -> when (value) {
        is Instant -> s.setObject(i + 1, value.atOffset(java.time.ZoneOffset.UTC))
        else -> s.setObject(i + 1, value)
    } }
}
fun Connection.exec(sql: String, vararg params: Any?): Int = statement(sql, params).use { it.executeUpdate() }
fun Connection.rows(sql: String, vararg params: Any?): List<JsonObject> = statement(sql, params).use { s ->
    s.executeQuery().use { rs -> buildList {
        while (rs.next()) add(JsonObject((1..rs.metaData.columnCount).associate { i ->
            val value = when (val raw = rs.getObject(i)) {
                is Timestamp -> raw.toInstant().toString()
                is OffsetDateTime -> raw.toInstant().toString()
                else -> raw
            }
            rs.metaData.getColumnLabel(i) to json(value)
        }))
    } }
}
