package wasap

import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

/** Parses PROCESSED_REQUEST_RETENTION_DAYS: an integer of at least 1 day, 30 by default. */
fun retentionDays(raw: String?): Int {
    return positiveSetting("PROCESSED_REQUEST_RETENTION_DAYS", raw, 30)
}

internal fun positiveSetting(name: String, raw: String?, default: Int): Int {
    if (raw.isNullOrBlank()) return default
    return raw.trim().toIntOrNull()?.takeIf { it >= 1 }
        ?: throw ApiError("VALIDATION", "$name debe ser un entero mayor o igual a 1")
}

/** Background housekeeping for the running server. Failures are logged without details. */
class Maintenance : AutoCloseable {
    private val scheduler: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor { task ->
        Thread(task, "wasap-maintenance").apply { isDaemon = true }
    }

    fun every(period: Long, unit: TimeUnit, name: String, task: () -> Unit) {
        scheduler.scheduleWithFixedDelay({
            try {
                task()
            } catch (e: Exception) {
                System.err.println("$name failed: ${e.javaClass.simpleName}${sqlStateClass(e)?.let { " (SQLSTATE class $it)" } ?: ""}")
            }
        }, 0, period, unit)
    }

    override fun close() {
        scheduler.shutdownNow()
    }
}
