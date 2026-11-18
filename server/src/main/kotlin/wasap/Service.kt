package wasap

import kotlinx.serialization.json.*
import java.sql.Connection
import java.sql.SQLException
import java.time.LocalDate
import java.time.ZoneId
import java.util.Locale
import java.util.UUID

data class ServerIdentity(val id: String, val name: String)

class Service(private val db: Database, private val zone: ZoneId = ZoneId.of("America/Mexico_City")) {
    private val mutations = setOf("attendance.mark", "conversations.direct", "groups.create", "groups.add", "groups.remove", "messages.send")
    private val userColumns = "id::text, matricula, name"
    private val eventColumns = "id::text, seq::text, type, recorded_at AS \"recordedAt\", class_id::text AS \"classId\""
    private val conversationColumns = "c.id::text, c.kind, c.name, c.owner_id::text AS \"ownerId\", c.last_seq::text AS \"lastSeq\", c.is_class AS \"isClass\""
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
        db.transaction { c ->
            val id = c.rows("UPDATE users SET pin_hash=?,credential_version=credential_version+1 WHERE matricula=? RETURNING id::text", hash, this.matricula(matricula)).firstOrNull()
                ?: throw ApiError("NOT_FOUND", "Matrícula no encontrada")
            c.exec("DELETE FROM sessions WHERE user_id=?::uuid", id.string("id"))
        }
    }

    /** Ends every session of the user (lost phone); returns how many were closed. */
    fun logoutUser(matricula: String): Int = db.transaction { c ->
        c.exec("DELETE FROM sessions WHERE user_id=?::uuid", user(c, matricula).string("id"))
    }

    // Use an independently salted dummy hash to perform comparable work for unknown accounts.
    private val dummyHash by lazy { Pins.hash("000000") }
    fun authenticate(matricula: String, pin: String): User {
        val row = db.transaction { it.rows("SELECT $userColumns, role, pin_hash, credential_version FROM users WHERE matricula=?", this.matricula(matricula)).firstOrNull() }
        val valid = Pins.verify(pin, row?.string("pin_hash") ?: dummyHash)
        if (row == null || !valid) throw ApiError("INVALID_CREDENTIALS", "Matrícula o PIN incorrectos")
        return row.toUser().copy(role = row.string("role")).also { it.credentialVersion = row["credential_version"]!!.jsonPrimitive.int }
    }

    fun call(userId: String, operation: String, payload: JsonObject, requestId: String): JsonObject = db.transaction { c ->
        if (operation in mutations) {
            // NO KEY UPDATE serializes a user's mutations without conflicting with FK key-share locks.
            if (c.rows("SELECT id FROM users WHERE id=?::uuid FOR NO KEY UPDATE", userId).isEmpty()) throw ApiError("UNAUTHENTICATED", "Usuario no encontrado")
            val previous = c.rows("SELECT operation, payload::text, result::text FROM processed_requests WHERE user_id=?::uuid AND request_id=?::uuid", userId, requestId).firstOrNull()
            if (previous != null) {
                if (previous.string("operation") != operation || Json.parseToJsonElement(previous.string("payload")) != payload) {
                    throw ApiError("REQUEST_ID_REUSED", "El identificador ya fue usado para otra solicitud")
                }
                // A stored reply is not permission to regain access to a revoked conversation.
                if ((operation.startsWith("groups.") && operation != "groups.create") || operation == "messages.send") {
                    conversation(c, userId, payload.uuid("conversationId"))
                }
                Json.parseToJsonElement(previous.string("result")).jsonObject
            } else {
                perform(c, userId, operation, payload).also { result ->
                    c.exec("INSERT INTO processed_requests(user_id,request_id,operation,payload,result) VALUES (?::uuid,?::uuid,?,?::jsonb,?::jsonb)", userId, requestId, operation, payload.toString(), result.toString())
                }
            }
        } else {
            perform(c, userId, operation, payload)
        }
    }

    private fun conversation(c: Connection, uid: String, cid: String, lock: Boolean = false, shared: Boolean = false): JsonObject {
        val row = c.rows(
            "SELECT $conversationColumns FROM conversations c WHERE c.id=?::uuid${if (lock) {
                " FOR UPDATE OF c"
            } else if (shared) {
                " FOR SHARE OF c"
            } else {
                ""
            }}",
            cid,
        ).firstOrNull()
            ?: throw ApiError("NOT_FOUND", "Conversación no encontrada")
        if (row.string("kind") != "GENERAL" && c.rows("SELECT user_id FROM conversation_members WHERE conversation_id=?::uuid AND user_id=?::uuid", cid, uid).isEmpty()) {
            throw ApiError("FORBIDDEN", "No perteneces a esta conversación")
        }
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
    fun canAccess(uid: String, cid: String): Boolean = try {
        db.transaction {
            conversation(it, uid, cid)
            true
        }
    } catch (_: ApiError) {
        false
    }

    /** Last movement of [uid] in [classId], or at the general door when it is null. */
    private fun lastEvent(c: Connection, uid: String, classId: String?) = c.rows(
        "SELECT $eventColumns FROM attendance_events WHERE user_id=?::uuid AND class_id IS NOT DISTINCT FROM ?::uuid ORDER BY seq DESC LIMIT 1",
        uid,
        classId,
    ).firstOrNull()

    /** The optional classId of an attendance payload, checked to be a class [uid] belongs to. */
    private fun attendanceClass(c: Connection, uid: String, p: JsonObject): String? {
        val classId = p.optional("classId")?.let(::uuid) ?: return null
        val row = conversation(c, uid, classId) // NOT_FOUND / FORBIDDEN for non-members
        if (row["isClass"]?.jsonPrimitive?.booleanOrNull != true) invalid("La conversación no es una clase")
        return classId
    }
    private fun nextType(event: JsonObject?) = if (event?.string("type") == "ENTRY") "EXIT" else "ENTRY"

    private fun perform(c: Connection, uid: String, operation: String, p: JsonObject): JsonObject = when (operation) {
        "attendance.classReport" -> {
            val classId = p.uuid("classId")
            val row = c.rows("SELECT owner_id::text AS \"ownerId\", is_class AS \"isClass\" FROM conversations WHERE id=?::uuid", classId).firstOrNull()
                ?: throw ApiError("NOT_FOUND", "Clase no encontrada")
            if (row["isClass"]?.jsonPrimitive?.booleanOrNull != true) throw ApiError("NOT_FOUND", "Clase no encontrada")
            if (row.optional("ownerId") != uid && role(c, uid) != "admin") throw ApiError("FORBIDDEN", "Solo el responsable de la clase consulta su lista")
            attendance(c, null, p, AttendanceScope(classId), withOwner = true)
        }

        "classes.list" -> obj(
            "classes" to c.rows(
                """
                SELECT $conversationColumns, (c.owner_id = ?::uuid) AS "isOwner" FROM conversations c
                JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?::uuid
                WHERE c.is_class ORDER BY c.name, c.id
                """,
                uid,
                uid,
            ),
        )

        "users.setRole" -> {
            requireRole(c, uid, "admin")
            val role = p.string("role")
            if (role !in setOf("admin", "teacher", "student")) invalid("El rol debe ser admin, teacher o student")
            val user = c.rows("UPDATE users SET role=? WHERE matricula=? RETURNING $userColumns, role", role, matricula(p.string("matricula"))).firstOrNull()
                ?: throw ApiError("NOT_FOUND", "Matrícula no encontrada")
            obj("user" to user)
        }

        "users.list" -> {
            // Search only: never the whole directory. Counted in code points after trimming.
            val raw = p.optional("query")?.trim() ?: ""
            val length = raw.codePointCount(0, raw.length)
            if (length < 3) invalid("Escribe al menos 3 letras o números para buscar")
            val q = raw.substring(0, raw.offsetByCodePoints(0, minOf(length, 120)))
            obj("users" to c.rows("SELECT $userColumns FROM users WHERE strpos(lower(matricula), lower(?))>0 OR strpos(lower(name), lower(?))>0 ORDER BY matricula LIMIT 100", q, q))
        }

        "attendance.state" -> {
            val classId = attendanceClass(c, uid, p)
            lastEvent(c, uid, classId).let { obj("lastEvent" to it, "nextType" to nextType(it), "classId" to classId, "timezone" to zone.id, "today" to LocalDate.now(zone).toString()) }
        }

        "attendance.mark" -> {
            if (!p.containsKey("expectedLastEventId")) invalid("Se requiere expectedLastEventId")
            val classId = attendanceClass(c, uid, p)
            val previous = lastEvent(c, uid, classId)
            val expected = p.optional("expectedLastEventId")?.let(::uuid)
            if (previous?.string("id") != expected) throw ApiError("CONFLICT", "El último movimiento cambió; actualiza antes de registrar")
            val event = c.rows(
                "INSERT INTO attendance_events(id,user_id,type,class_id) VALUES (?::uuid,?::uuid,?,?::uuid) RETURNING $eventColumns",
                UUID.randomUUID().toString(),
                uid,
                nextType(previous),
                classId,
            ).single()
            obj("event" to event, "nextType" to nextType(event), "classId" to classId)
        }

        "attendance.list" -> attendance(c, uid, p, AttendanceScope(attendanceClass(c, uid, p)))

        "conversations.list" -> {
            val after = p.optional("after")?.let(::uuid)
            val limit = p.limit()
            val items = c.rows(
                """
                SELECT $conversationColumns FROM conversations c
                WHERE (c.kind='GENERAL' OR EXISTS (SELECT 1 FROM conversation_members cm WHERE cm.conversation_id=c.id AND cm.user_id=?::uuid))
                AND (?::uuid IS NULL OR c.id>?::uuid) ORDER BY c.id LIMIT ?
            """,
                uid,
                after,
                after,
                limit + 1,
            )
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
            val cid = c.rows(
                """
                INSERT INTO conversations(id,kind,name,direct_key) VALUES (?::uuid,'DIRECT','Privado',?)
                ON CONFLICT (direct_key) DO UPDATE SET direct_key=EXCLUDED.direct_key RETURNING id::text
            """,
                UUID.randomUUID().toString(),
                key,
            ).single().string("id")
            listOf(uid, peer).forEach { c.exec("INSERT INTO conversation_members(conversation_id,user_id) VALUES (?::uuid,?::uuid) ON CONFLICT DO NOTHING", cid, it) }
            obj("conversation" to withPeer(c, uid, conversation(c, uid, cid)))
        }

        "groups.create" -> {
            // A class is a group with its own attendance; only teachers and admins create them.
            val isClass = p["class"]?.let { (it as? JsonPrimitive)?.takeUnless { v -> v.isString }?.booleanOrNull ?: invalid("class debe ser booleano") } ?: false
            if (isClass) requireRole(c, uid, "teacher", "admin")
            val name = text(p.string("name"), 80, if (isClass) "Nombre de la clase" else "Nombre del grupo")
            val members = p["matriculas"] as? JsonArray ?: invalid("matriculas debe ser una lista")
            if (members.size > 100) invalid("Máximo 100 integrantes por solicitud")
            val ids = members.map { user(c, (it as? JsonPrimitive)?.takeIf { v -> v.isString }?.content ?: invalid("Matrícula inválida")).string("id") }.toSet() + uid
            if (ids.size > 100) invalid("Máximo 100 integrantes por grupo")
            val cid = UUID.randomUUID().toString()
            c.exec("INSERT INTO conversations(id,kind,name,owner_id,is_class) VALUES (?::uuid,'GROUP',?,?::uuid,?)", cid, name, uid, isClass)
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
            val items = c.rows(
                """
                SELECT $messageColumns FROM messages m JOIN users u ON u.id=m.sender_id
                WHERE m.conversation_id=?::uuid AND (?::bigint IS NULL OR m.seq < ?::bigint) AND (?::bigint IS NULL OR m.seq > ?::bigint)
                ORDER BY m.seq ${if (after != null) "ASC" else "DESC"} LIMIT ?
            """,
                cid,
                before,
                before,
                after,
                after,
                limit + 1,
            )
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

    private fun date(value: String?) = value?.let {
        try {
            LocalDate.parse(it)
        } catch (_: Exception) {
            invalid("Fecha inválida; usa YYYY-MM-DD")
        }
    }

    /** Which movements a query covers: one class, the general door (null), or every class ([all]). */
    private data class AttendanceScope(val classId: String?, val all: Boolean = false)

    private fun attendance(c: Connection, uid: String?, p: JsonObject, scope: AttendanceScope, withOwner: Boolean = false): JsonObject {
        val before = p.cursor("before")
        val from = date(p.optional("from"))
        val to = date(p.optional("to"))
        if (from != null && to != null && from > to) invalid("Rango de fechas inválido")
        val start = from?.atStartOfDay(zone)?.toInstant()
        val end = to?.plusDays(1)?.atStartOfDay(zone)?.toInstant()
        val limit = p.limit()
        val items = c.rows(
            """
            SELECT a.id::text, a.seq::text, a.type, a.recorded_at AS "recordedAt", a.class_id::text AS "classId"
                ${if (withOwner) ", u.matricula, u.name, k.name AS \"className\"" else ""}
            FROM attendance_events a JOIN users u ON u.id = a.user_id LEFT JOIN conversations k ON k.id = a.class_id
            WHERE (?::uuid IS NULL OR a.user_id=?::uuid)
            AND (? OR a.class_id IS NOT DISTINCT FROM ?::uuid)
            AND (?::bigint IS NULL OR a.seq<?::bigint)
            AND (?::timestamptz IS NULL OR a.recorded_at>=?::timestamptz) AND (?::timestamptz IS NULL OR a.recorded_at<?::timestamptz)
            ORDER BY a.seq DESC LIMIT ?
        """,
            uid, uid, scope.all, scope.classId, before, before, start, start, end, end, limit + 1,
        )
        val page = items.take(limit)
        return obj("events" to page, "nextCursor" to if (items.size > limit) page.last().string("seq") else null)
    }
    fun adminAttendance(matricula: String?, payload: JsonObject): JsonObject = db.transaction { c ->
        val uid = matricula?.let { user(c, it).string("id") }
        val classId = payload.optional("classId")?.let(::uuid)
        attendance(c, uid, payload, AttendanceScope(classId, all = classId == null), withOwner = true)
    }

    /**
     * Every movement matching [payload] (all pages) as CSV: matrícula, nombre, clase, tipo and
     * local time in the server's zone. The general door shows as «General».
     */
    fun attendanceCsv(matricula: String?, payload: JsonObject): String = buildString {
        append("matricula,nombre,clase,tipo,instante_local\n")
        val local = java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(zone)
        var cursor: String? = payload.optional("before")
        do {
            val page = adminAttendance(matricula, JsonObject(payload + ("before" to json(cursor)) + ("limit" to json(100))))
            page["events"]!!.jsonArray.map { it.jsonObject }.forEach { e ->
                val cells = listOf(
                    e.string("matricula"),
                    e.string("name"),
                    e.optional("className") ?: "General",
                    if (e.string("type") == "ENTRY") "Entrada" else "Salida",
                    local.format(java.time.Instant.parse(e.string("recordedAt"))),
                )
                append(cells.joinToString(",") { csvCell(it) }).append('\n')
            }
            cursor = page.optional("nextCursor")
        } while (cursor != null)
    }

    private fun csvCell(value: String): String {
        // Quote when needed, and neutralise formulas for spreadsheet programs.
        val safe = if (value.firstOrNull() in setOf('=', '+', '-', '@')) "'$value" else value
        return if (safe.any { it == ',' || it == '"' || it == '\n' || it == '\r' }) "\"" + safe.replace("\"", "\"\"") + "\"" else safe
    }

    /** Deletes processed requests older than [retentionDays], in batches to keep locks short. */
    fun purgeProcessedRequests(retentionDays: Int): Int {
        require(retentionDays >= 1)
        var total = 0
        while (true) {
            val deleted = db.transaction {
                it.exec(
                    """
                DELETE FROM processed_requests WHERE ctid IN (
                    SELECT ctid FROM processed_requests WHERE created_at < now() - make_interval(days => ?) LIMIT 10000)
            """,
                    retentionDays,
                )
            }
            total += deleted
            if (deleted < 10000) return total
        }
    }
    fun users(): List<JsonObject> = db.transaction { it.rows("SELECT $userColumns FROM users ORDER BY matricula") }

    /** Current role of [uid], read inside the caller's transaction so a role change applies at once. */
    private fun role(c: Connection, uid: String): String = c.rows("SELECT role FROM users WHERE id=?::uuid", uid).firstOrNull()?.string("role")
        ?: throw ApiError("UNAUTHENTICATED", "Usuario no encontrado")

    private fun requireRole(c: Connection, uid: String, vararg allowed: String) {
        if (role(c, uid) !in allowed) throw ApiError("FORBIDDEN", "Tu rol no permite esta acción")
    }

    fun setRole(matricula: String, role: String): User {
        if (role !in setOf("admin", "teacher", "student")) invalid("El rol debe ser admin, teacher o student")
        return db.transaction { c ->
            c.rows("UPDATE users SET role=? WHERE matricula=? RETURNING $userColumns, role", role, this.matricula(matricula)).firstOrNull()
                ?.let { it.toUser().copy(role = it.string("role")) }
                ?: throw ApiError("NOT_FOUND", "Matrícula no encontrada")
        }
    }

    @Volatile private var identityCache: ServerIdentity? = null

    /** This server's stable identity, read once and cached; renaming refreshes it. */
    fun serverIdentity(): ServerIdentity = identityCache ?: db.transaction { c ->
        val row = c.rows("SELECT id::text, name FROM server_identity").single()
        ServerIdentity(row.string("id"), row.string("name"))
    }.also { identityCache = it }

    fun renameServer(name: String): ServerIdentity {
        val clean = text(name, 80, "Nombre del servidor")
        db.transaction { it.exec("UPDATE server_identity SET name = ?", clean) }
        identityCache = null
        return serverIdentity()
    }
}
