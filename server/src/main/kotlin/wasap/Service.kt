package wasap

import java.sql.Connection
import java.sql.SQLException
import java.time.LocalDate
import java.time.ZoneId
import java.util.Locale
import java.util.UUID
import kotlinx.serialization.json.*

class Service(private val db: Database, private val zone: ZoneId = ZoneId.of("America/Mexico_City")) {
    private val mutations = setOf("attendance.mark", "conversations.direct", "groups.create", "groups.add", "groups.remove", "messages.send")
    private val userColumns = "id::text, matricula, name"
    private val eventColumns = "id::text, seq::text, type, recorded_at AS \"recordedAt\""
    private val conversationColumns = "c.id::text, c.kind, c.name, c.owner_id::text AS \"ownerId\", c.last_seq::text AS \"lastSeq\""
    private val messageColumns = "m.id::text, m.conversation_id::text AS \"conversationId\", m.seq::text, m.sender_id::text AS \"senderId\", u.name AS \"senderName\", m.text, m.created_at AS \"createdAt\""

    private fun matricula(value: String): String = value.trim().uppercase(Locale.ROOT).also {
        if (!it.matches(Regex("[A-Z0-9][A-Z0-9_.-]{0,31}"))) invalid("Matrícula inválida")
    }
    private fun text(value: String, max: Int, label: String): String = value.trim().also {
        if (it.isEmpty() || it.length > max || it.indexOf('\u0000') >= 0 || (label != "Mensaje" && it.any { ch -> Character.isISOControl(ch) })) invalid("$label debe tener entre 1 y $max caracteres")
    }
    private fun JsonObject.toUser() = User(string("id"), string("matricula"), string("name"))
    private fun user(c: Connection, matricula: String): JsonObject = c.rows("SELECT $userColumns FROM users WHERE matricula=?", this.matricula(matricula)).firstOrNull()
        ?: throw ApiError("NOT_FOUND", "Matrícula no encontrada")

    fun createUser(matricula: String, name: String, pin: String): User {
        val normalized = this.matricula(matricula)
        val displayName = text(name, 120, "Nombre")
        val hash = Pins.hash(pin)
        val id = UUID.randomUUID().toString()
        return try {
            db.transaction { it.exec("INSERT INTO users(id,matricula,name,pin_hash) VALUES (?::uuid,?,?,?)", id, normalized, displayName, hash) }
            User(id, normalized, displayName)
        } catch (e: SQLException) {
            if (e.sqlState == "23505") throw ApiError("CONFLICT", "La matrícula ya existe") else throw e
        }
    }
    fun resetPin(matricula: String, pin: String) {
        val hash = Pins.hash(pin)
        db.transaction { c -> if (c.exec("UPDATE users SET pin_hash=?,credential_version=credential_version+1 WHERE matricula=?", hash, this.matricula(matricula)) == 0) throw ApiError("NOT_FOUND", "Matrícula no encontrada") }
    }
    // Use an independently salted dummy hash to perform comparable work for unknown accounts.
    private val dummyHash by lazy { Pins.hash("000000") }
    fun authenticate(matricula: String, pin: String): User {
        val row = db.transaction { it.rows("SELECT $userColumns, pin_hash, credential_version FROM users WHERE matricula=?", this.matricula(matricula)).firstOrNull() }
        val valid = Pins.verify(pin, row?.string("pin_hash") ?: dummyHash)
        if (row == null || !valid) throw ApiError("INVALID_CREDENTIALS", "Matrícula o PIN incorrectos")
        return row.toUser().also { it.credentialVersion = row["credential_version"]!!.jsonPrimitive.int }
    }
    fun credentialVersion(userId: String): Int = db.transaction { c ->
        c.rows("SELECT credential_version FROM users WHERE id=?::uuid", userId).firstOrNull()?.get("credential_version")?.jsonPrimitive?.int
            ?: throw ApiError("UNAUTHENTICATED", "Usuario no encontrado")
    }

    fun call(userId: String, operation: String, payload: JsonObject, requestId: String): JsonObject = db.transaction { c ->
        if (operation in mutations) {
            // NO KEY UPDATE serializes a user's mutations without conflicting with FK key-share locks.
            if (c.rows("SELECT id FROM users WHERE id=?::uuid FOR NO KEY UPDATE", userId).isEmpty()) throw ApiError("UNAUTHENTICATED", "Usuario no encontrado")
            val previous = c.rows("SELECT operation, payload::text, result::text FROM processed_requests WHERE user_id=?::uuid AND request_id=?::uuid", userId, requestId).firstOrNull()
            if (previous != null) {
                if (previous.string("operation") != operation || Json.parseToJsonElement(previous.string("payload")) != payload)
                    throw ApiError("REQUEST_ID_REUSED", "El identificador ya fue usado para otra solicitud")
                // A stored reply is not permission to regain access to a revoked conversation.
                if (operation.startsWith("groups.") && operation != "groups.create" || operation == "messages.send")
                    conversation(c, userId, payload.uuid("conversationId"))
                Json.parseToJsonElement(previous.string("result")).jsonObject
            } else {
                perform(c, userId, operation, payload).also { result ->
                    c.exec("INSERT INTO processed_requests(user_id,request_id,operation,payload,result) VALUES (?::uuid,?::uuid,?,?::jsonb,?::jsonb)", userId, requestId, operation, payload.toString(), result.toString())
                }
            }
        } else perform(c, userId, operation, payload)
    }

    private fun conversation(c: Connection, uid: String, cid: String, lock: Boolean = false, shared: Boolean = false): JsonObject {
        val row = c.rows("SELECT $conversationColumns FROM conversations c WHERE c.id=?::uuid${if (lock) " FOR UPDATE OF c" else if (shared) " FOR SHARE OF c" else ""}", cid).firstOrNull()
            ?: throw ApiError("NOT_FOUND", "Conversación no encontrada")
        if (row.string("kind") != "GENERAL" && c.rows("SELECT user_id FROM conversation_members WHERE conversation_id=?::uuid AND user_id=?::uuid", cid, uid).isEmpty())
            throw ApiError("FORBIDDEN", "No perteneces a esta conversación")
        return row
    }
    private fun withPeer(c: Connection, uid: String, row: JsonObject): JsonObject {
        if (row.string("kind") != "DIRECT") return row
        val peer = c.rows("SELECT u.id::text,u.matricula,u.name FROM users u JOIN conversation_members cm ON cm.user_id=u.id WHERE cm.conversation_id=?::uuid AND u.id<>?::uuid", row.string("id"), uid).single()
        return JsonObject(row + ("peer" to peer))
    }
    /**
     * Users whose conversation list changed after a committed membership operation: current
     * members of the conversation, plus the removed member for groups.remove.
     */
    fun affectedUsers(operation: String, payload: JsonObject, result: JsonObject): Set<String> = db.transaction { c ->
        val cid = (result["conversation"] as? JsonObject)?.string("id") ?: payload.uuid("conversationId")
        val users = c.rows("SELECT user_id::text AS id FROM conversation_members WHERE conversation_id=?::uuid", cid).map { it.string("id") }.toMutableSet()
        if (operation == "groups.remove") c.rows("SELECT id::text FROM users WHERE matricula=?", matricula(payload.string("matricula"))).firstOrNull()?.let { users += it.string("id") }
        users
    }
    fun canAccess(uid: String, cid: String): Boolean = try { db.transaction { conversation(it, uid, cid); true } } catch (_: ApiError) { false }
    private fun lastEvent(c: Connection, uid: String) = c.rows("SELECT $eventColumns FROM attendance_events WHERE user_id=?::uuid ORDER BY seq DESC LIMIT 1", uid).firstOrNull()
    private fun nextType(event: JsonObject?) = if (event?.string("type") == "ENTRY") "EXIT" else "ENTRY"

    private fun perform(c: Connection, uid: String, operation: String, p: JsonObject): JsonObject = when (operation) {
        "users.list" -> {
            val q = p.optional("query")?.take(120) ?: ""
            obj("users" to c.rows("SELECT $userColumns FROM users WHERE strpos(lower(matricula), lower(?))>0 OR strpos(lower(name), lower(?))>0 ORDER BY matricula LIMIT 100", q, q))
        }
        "attendance.state" -> lastEvent(c, uid).let { obj("lastEvent" to it, "nextType" to nextType(it), "timezone" to zone.id, "today" to LocalDate.now(zone).toString()) }
        "attendance.mark" -> {
            if (!p.containsKey("expectedLastEventId")) invalid("Se requiere expectedLastEventId")
            val previous = lastEvent(c, uid)
            val expected = p.optional("expectedLastEventId")?.let(::uuid)
            if (previous?.string("id") != expected) throw ApiError("CONFLICT", "El último movimiento cambió; actualiza antes de registrar")
            val event = c.rows("INSERT INTO attendance_events(id,user_id,type) VALUES (?::uuid,?::uuid,?) RETURNING $eventColumns", UUID.randomUUID().toString(), uid, nextType(previous)).single()
            obj("event" to event, "nextType" to nextType(event))
        }
        "attendance.list" -> attendance(c, uid, p)
        "conversations.list" -> {
            val after = p.optional("after")?.let(::uuid)
            val limit = p.limit()
            val items = c.rows("""
                SELECT $conversationColumns FROM conversations c
                WHERE (c.kind='GENERAL' OR EXISTS (SELECT 1 FROM conversation_members cm WHERE cm.conversation_id=c.id AND cm.user_id=?::uuid))
                AND (?::uuid IS NULL OR c.id>?::uuid) ORDER BY c.id LIMIT ?
            """, uid, after, after, limit + 1)
            var bytes = 0
            // ponytail: at most 100 peer lookups per page; batch if directory latency becomes a problem.
            val page = items.take(limit).map { withPeer(c, uid, it) }.takeWhile { item ->
                bytes += item.toString().toByteArray(Charsets.UTF_8).size + 1
                bytes <= 48000
            }
            obj("conversations" to page, "nextCursor" to if (items.size > page.size) page.last().string("id") else null)
        }
        "conversations.direct" -> {
            val peer = user(c, p.string("matricula")).string("id")
            if (peer == uid) invalid("Selecciona otra matrícula")
            val key = listOf(uid, peer).sorted().joinToString(":")
            val cid = c.rows("""
                INSERT INTO conversations(id,kind,name,direct_key) VALUES (?::uuid,'DIRECT','Privado',?)
                ON CONFLICT (direct_key) DO UPDATE SET direct_key=EXCLUDED.direct_key RETURNING id::text
            """, UUID.randomUUID().toString(), key).single().string("id")
            listOf(uid, peer).forEach { c.exec("INSERT INTO conversation_members(conversation_id,user_id) VALUES (?::uuid,?::uuid) ON CONFLICT DO NOTHING", cid, it) }
            obj("conversation" to withPeer(c, uid, conversation(c, uid, cid)))
        }
        "groups.create" -> {
            val name = text(p.string("name"), 80, "Nombre del grupo")
            val members = p["matriculas"] as? JsonArray ?: invalid("matriculas debe ser una lista")
            if (members.size > 100) invalid("Máximo 100 integrantes por solicitud")
            val ids = members.map { user(c, (it as? JsonPrimitive)?.takeIf { v -> v.isString }?.content ?: invalid("Matrícula inválida")).string("id") }.toSet() + uid
            if (ids.size > 100) invalid("Máximo 100 integrantes por grupo")
            val cid = UUID.randomUUID().toString()
            c.exec("INSERT INTO conversations(id,kind,name,owner_id) VALUES (?::uuid,'GROUP',?,?::uuid)", cid, name, uid)
            ids.forEach { c.exec("INSERT INTO conversation_members(conversation_id,user_id) VALUES (?::uuid,?::uuid)", cid, it) }
            obj("conversation" to conversation(c, uid, cid))
        }
        "groups.members" -> {
            val cid = p.uuid("conversationId")
            conversation(c, uid, cid, shared = true)
            obj("members" to c.rows("SELECT u.id::text,u.matricula,u.name FROM users u JOIN conversation_members cm ON cm.user_id=u.id WHERE cm.conversation_id=?::uuid ORDER BY u.matricula", cid))
        }
        "groups.add", "groups.remove" -> {
            val cid = p.uuid("conversationId")
            val group = conversation(c, uid, cid, lock = true)
            if (group.string("kind") != "GROUP" || group.optional("ownerId") != uid) throw ApiError("FORBIDDEN", "Solo el creador puede administrar integrantes")
            val member = user(c, p.string("matricula")).string("id")
            if (operation == "groups.remove") {
                if (member == uid) invalid("El creador debe permanecer en el grupo")
                c.exec("DELETE FROM conversation_members WHERE conversation_id=?::uuid AND user_id=?::uuid", cid, member)
            } else {
                val count = c.rows("SELECT count(*) AS total FROM conversation_members WHERE conversation_id=?::uuid", cid).single()["total"]!!.jsonPrimitive.int
                val exists = c.rows("SELECT user_id FROM conversation_members WHERE conversation_id=?::uuid AND user_id=?::uuid", cid, member).isNotEmpty()
                if (!exists && count >= 100) invalid("Máximo 100 integrantes por grupo")
                c.exec("INSERT INTO conversation_members(conversation_id,user_id) VALUES (?::uuid,?::uuid) ON CONFLICT DO NOTHING", cid, member)
            }
            obj()
        }
        "messages.send" -> {
            val cid = p.uuid("conversationId")
            val body = text(p.string("text"), 4000, "Mensaje")
            conversation(c, uid, cid, lock = true)
            val seq = c.rows("UPDATE conversations SET last_seq=last_seq+1 WHERE id=?::uuid RETURNING last_seq", cid).single()["last_seq"]!!.jsonPrimitive.long
            val id = UUID.randomUUID().toString()
            c.exec("INSERT INTO messages(id,conversation_id,seq,sender_id,text) VALUES (?::uuid,?::uuid,?,?::uuid,?)", id, cid, seq, uid, body)
            obj("message" to c.rows("SELECT $messageColumns FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.id=?::uuid", id).single())
        }
        "messages.list" -> {
            val cid = p.uuid("conversationId")
            conversation(c, uid, cid, shared = true)
            val before = p.cursor("before")
            val after = p.cursor("after")
            if (before != null && after != null) invalid("Usa before o after, no ambos")
            val limit = p.limit()
            val items = c.rows("""
                SELECT $messageColumns FROM messages m JOIN users u ON u.id=m.sender_id
                WHERE m.conversation_id=?::uuid AND (?::bigint IS NULL OR m.seq < ?::bigint) AND (?::bigint IS NULL OR m.seq > ?::bigint)
                ORDER BY m.seq ${if (after != null) "ASC" else "DESC"} LIMIT ?
            """, cid, before, before, after, after, limit + 1)
            // Bound the encoded bytes, not just row count: unicode text can use several bytes per character.
            var bytes = 0
            val selected = items.take(limit).takeWhile { item ->
                bytes += item.toString().toByteArray(Charsets.UTF_8).size + 1
                bytes <= 48000
            }
            val page = if (after == null) selected.reversed() else selected
            obj("messages" to page, "nextCursor" to if (items.size > selected.size) (if (after == null) page.first() else page.last()).string("seq") else null)
        }
        else -> invalid("Operación desconocida")
    }

    private fun date(value: String?) = value?.let { try { LocalDate.parse(it) } catch (_: Exception) { invalid("Fecha inválida; usa YYYY-MM-DD") } }
    private fun attendance(c: Connection, uid: String?, p: JsonObject): JsonObject {
        val before = p.cursor("before")
        val from = date(p.optional("from"))
        val to = date(p.optional("to"))
        if (from != null && to != null && from > to) invalid("Rango de fechas inválido")
        val start = from?.atStartOfDay(zone)?.toInstant()
        val end = to?.plusDays(1)?.atStartOfDay(zone)?.toInstant()
        val limit = p.limit()
        val items = c.rows("""
            SELECT $eventColumns FROM attendance_events WHERE (?::uuid IS NULL OR user_id=?::uuid)
            AND (?::bigint IS NULL OR seq<?::bigint)
            AND (?::timestamptz IS NULL OR recorded_at>=?::timestamptz) AND (?::timestamptz IS NULL OR recorded_at<?::timestamptz)
            ORDER BY seq DESC LIMIT ?
        """, uid, uid, before, before, start, start, end, end, limit + 1)
        val page = items.take(limit)
        return obj("events" to page, "nextCursor" to if (items.size > limit) page.last().string("seq") else null)
    }
    fun adminAttendance(matricula: String?, payload: JsonObject): JsonObject = db.transaction { c ->
        val uid = matricula?.let { user(c, it).string("id") }
        val result = attendance(c, uid, payload)
        val events = result["events"]!!.jsonArray.map { entry ->
            val event = entry.jsonObject
            val owner = c.rows("SELECT u.matricula,u.name FROM users u JOIN attendance_events a ON a.user_id=u.id WHERE a.id=?::uuid", event.string("id")).single()
            JsonObject(event + owner)
        }
        JsonObject(result + ("events" to JsonArray(events)))
    }
    /** Deletes processed requests older than [retentionDays], in batches to keep locks short. */
    fun purgeProcessedRequests(retentionDays: Int): Int {
        require(retentionDays >= 1)
        var total = 0
        while (true) {
            val deleted = db.transaction { it.exec("""
                DELETE FROM processed_requests WHERE ctid IN (
                    SELECT ctid FROM processed_requests WHERE created_at < now() - make_interval(days => ?) LIMIT 10000)
            """, retentionDays) }
            total += deleted
            if (deleted < 10000) return total
        }
    }
    fun users(): List<JsonObject> = db.transaction { it.rows("SELECT $userColumns FROM users ORDER BY matricula") }
}
