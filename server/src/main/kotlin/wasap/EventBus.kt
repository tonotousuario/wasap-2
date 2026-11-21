package wasap

import kotlinx.serialization.json.JsonObject
import java.util.concurrent.CopyOnWriteArrayList

/** A committed event hint. A null audience means all authenticated users. */
data class SocketEvent(val frame: JsonObject, val audience: Set<String>?, val conversationId: String? = null)

interface EventBus {
    fun publish(event: SocketEvent)
    fun subscribe(handler: (SocketEvent) -> Unit): AutoCloseable
}

/** Dispatches to local subscribers immediately. Socket writers handle delivery separately. */
class InMemoryEventBus : EventBus {
    private val subscribers = CopyOnWriteArrayList<(SocketEvent) -> Unit>()

    override fun publish(event: SocketEvent) {
        subscribers.forEach { it(event) }
    }

    override fun subscribe(handler: (SocketEvent) -> Unit): AutoCloseable {
        subscribers.add(handler)
        return AutoCloseable { subscribers.remove(handler) }
    }
}
