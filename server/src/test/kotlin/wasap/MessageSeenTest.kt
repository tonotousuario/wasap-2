package wasap

import kotlinx.serialization.json.*
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import kotlin.test.*

@Tag("integration")
class MessageSeenTest {
    @Test fun `only another member can confirm explicit messages and only their author gets the receipt`() {
        TestServer().use { env ->
            env.service.createUser("A001", "Ana", "123456")
            env.service.createUser("B001", "Bruno", "123456")
            env.service.createUser("C001", "Celia", "123456")
            env.connect().use { author ->
                env.connect().use { reader ->
                    env.connect().use { outsider ->
                        assertEquals(json(true), author.ok("server.hello")["messageReceipts"])
                        author.login("A001", "123456")
                        reader.login("B001", "123456")
                        outsider.login("C001", "123456")
                        val cid = author.ok("conversations.direct", obj("matricula" to "B001"))["conversation"]!!.jsonObject.string("id")
                        val message = author.ok("messages.send", obj("conversationId" to cid, "text" to "Hola"))["message"]!!.jsonObject
                        val other = author.ok("messages.send", obj("conversationId" to cid, "text" to "Todavía no visible"))["message"]!!.jsonObject
                        val mid = message.string("id")
                        val receipt = obj("conversationId" to cid, "messageIds" to listOf(mid))
                        val history = obj("conversationId" to cid)

                        assertEquals("FORBIDDEN", outsider.errorCode("messages.seen", receipt))
                        assertEquals("VALIDATION", reader.errorCode("messages.seen", obj("conversationId" to cid, "messageIds" to List(51) { mid })))
                        assertEquals("VALIDATION", reader.errorCode("messages.seen", obj("conversationId" to cid, "messageIds" to listOf(1))))
                        assertEquals(json(emptyList<String>()), author.ok("messages.seen", receipt)["seenIds"])
                        val wrongChat = obj("conversationId" to "00000000-0000-4000-8000-000000000001", "messageIds" to listOf(mid))
                        assertEquals(json(emptyList<String>()), reader.ok("messages.seen", wrongChat)["seenIds"])
                        assertEquals(json(emptyList<String>()), author.ok("messages.seen", receipt)["seenIds"])

                        repeat(2) {
                            assertEquals(json(emptyList<String>()), reader.ok("messages.seen", receipt)["seenIds"])
                        }
                        assertFalse("message.seen" in reader.drain())
                        assertFalse("message.seen" in outsider.drain())
                        author.drain()
                        assertEquals(receipt, author.events.single { it.string("type") == "message.seen" }["payload"])
                        assertEquals(json(listOf(mid)), author.ok("messages.seen", obj("conversationId" to cid, "messageIds" to listOf(mid, other.string("id"))))["seenIds"])
                        assertTrue(author.ok("messages.list", history)["messages"]!!.jsonArray.first().jsonObject["seen"]!!.jsonPrimitive.boolean)
                        val readerView = reader.ok("messages.list", history)["messages"]!!.jsonArray.first().jsonObject
                        assertFalse(readerView["seen"]?.jsonPrimitive?.booleanOrNull == true)
                    }
                }
            }
        }
    }
}
