package wasap

import kotlinx.serialization.json.*
import java.sql.Connection
import java.sql.SQLException
import java.time.LocalDate
import java.time.ZoneId
import java.util.Locale
import java.util.UUID

data class ServerIdentity(val id: String, val name: String)

class Service(private val db: Database, val zone: ZoneId = ZoneId.of("America/Mexico_City")) {
    // Invitation codes are never stored in clear, so invites.create/import are not replayable.
    private val mutations = setOf(
        "attendance.mark", "conversations.direct", "groups.create", "groups.add", "groups.remove", "messages.send",
        "invites.revoke", "classes.code", "signup.approve", "signup.reject",
    )
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
    private fun user(c: Connection, matricula: String): JsonObject = c.rows("SELECT $userColumns FROM users WHERE matricula=? AND status='active'", this.matricula(matricula)).firstOrNull()
        ?: throw ApiError("NOT_FOUND", "Matrícula no encontrada")

    // ---- Audit log (admin-web-panel) ----

    /** Fields allowed in audit details; anything else (PIN, passphrases, codes) is dropped. */
    private val auditFields = setOf("matricula", "name", "role", "count", "matriculas", "addresses", "dnsNames", "days", "notAfter", "sessions")

    /** Records [action] by [actor] (null = console) inside the caller's transaction. */
    internal fun audit(c: Connection, actor: String?, action: String, classId: String? = null, details: Map<String, Any?> = emptyMap()) {
        val safe = JsonObject(details.filterKeys { it in auditFields }.mapValues { json(it.value) })
        c.exec("INSERT INTO audit_log(actor_id,action,class_id,details) VALUES (?::uuid,?,?::uuid,?::jsonb)", actor, action, classId, safe.toString())
    }

    /** Records an action that has no transaction of its own (certificate issuance). */
    fun audit(actor: String?, action: String, details: Map<String, Any?>) = db.transaction { audit(it, actor, action, null, details) }

    fun createUser(matricula: String, name: String, pin: String, actor: String? = null): User {
        val normalized = this.matricula(matricula)
        val displayName = text(name, 120, "Nombre")
        val hash = Pins.hash(pin)
        val id = UUID.randomUUID().toString()
        return try {
            db.transaction {
                it.exec("INSERT INTO users(id,matricula,name,pin_hash) VALUES (?::uuid,?,?,?)", id, normalized, displayName, hash)
                audit(it, actor, "user.create", details = mapOf("matricula" to normalized, "name" to displayName))
            }
            User(id, normalized, displayName)
        } catch (e: SQLException) {
            if (e.sqlState == "23505") throw ApiError("CONFLICT", "La matrícula ya existe") else throw e
        }
    }
    fun resetPin(matricula: String, pin: String, actor: String? = null) {
        val hash = Pins.hash(pin)
        db.transaction { c ->
            val id = c.rows("UPDATE users SET pin_hash=?,credential_version=credential_version+1 WHERE matricula=? RETURNING id::text", hash, this.matricula(matricula)).firstOrNull()
                ?: throw ApiError("NOT_FOUND", "Matrícula no encontrada")
            c.exec("DELETE FROM sessions WHERE user_id=?::uuid", id.string("id"))
            c.exec("DELETE FROM panel_sessions WHERE user_id=?::uuid", id.string("id"))
            audit(c, actor, "user.pin_reset", details = mapOf("matricula" to this.matricula(matricula)))
        }
    }

    /** Ends every session of the user (lost phone); returns how many were closed. */
    fun logoutUser(matricula: String, actor: String? = null): Int = db.transaction { c ->
        val id = user(c, matricula).string("id")
        c.exec("DELETE FROM panel_sessions WHERE user_id=?::uuid", id)
        c.exec("DELETE FROM sessions WHERE user_id=?::uuid", id).also { closed ->
            audit(c, actor, "user.logout", details = mapOf("matricula" to this.matricula(matricula), "sessions" to closed))
        }
    }

    // Use an independently salted dummy hash to perform comparable work for unknown accounts.
    private val dummyHash by lazy { Pins.hash("000000") }
    fun authenticate(matricula: String, pin: String): User {
        val row = db.transaction { it.rows("SELECT $userColumns, role, status, pin_hash, credential_version FROM users WHERE matricula=?", this.matricula(matricula)).firstOrNull() }
        val valid = Pins.verify(pin, row?.string("pin_hash") ?: dummyHash)
        if (row == null || !valid) throw ApiError("INVALID_CREDENTIALS", "Matrícula o PIN incorrectos")
        // Revealed only to whoever knows the PIN.
        if (row.string("status") == "pending") throw ApiError("PENDING_APPROVAL", "Tu registro espera la aprobación de tu profesor")
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

        "invites.create", "invites.import", "invites.list", "invites.revoke", "classes.code", "signup.list", "signup.approve", "signup.reject" -> onboarding(c, uid, operation, p)

        "users.setRole" -> {
            requireRole(c, uid, "admin")
            val role = p.string("role")
            if (role !in setOf("admin", "teacher", "student")) invalid("El rol debe ser admin, teacher o student")
            val user = c.rows("UPDATE users SET role=? WHERE matricula=? RETURNING $userColumns, role", role, matricula(p.string("matricula"))).firstOrNull()
                ?: throw ApiError("NOT_FOUND", "Matrícula no encontrada")
            audit(c, uid, "user.role", details = mapOf("matricula" to user.string("matricula"), "role" to role))
            obj("user" to user)
        }

        "users.list" -> {
            // Search only: never the whole directory. Counted in code points after trimming.
            val raw = p.optional("query")?.trim() ?: ""
            val length = raw.codePointCount(0, raw.length)
            if (length < 3) invalid("Escribe al menos 3 letras o números para buscar")
            val q = raw.substring(0, raw.offsetByCodePoints(0, minOf(length, 120)))
            obj("users" to c.rows("SELECT $userColumns FROM users WHERE status='active' AND (strpos(lower(matricula), lower(?))>0 OR strpos(lower(name), lower(?))>0) ORDER BY matricula LIMIT 100", q, q))
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
        // door:true limits to the general door; otherwise no classId means every movement.
        val door = (payload["door"] as? JsonPrimitive)?.booleanOrNull == true
        attendance(c, uid, payload, AttendanceScope(classId, all = classId == null && !door), withOwner = true)
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

    fun setRole(matricula: String, role: String, actor: String? = null): User {
        if (role !in setOf("admin", "teacher", "student")) invalid("El rol debe ser admin, teacher o student")
        return db.transaction { c ->
            c.rows("UPDATE users SET role=? WHERE matricula=? RETURNING $userColumns, role", role, this.matricula(matricula)).firstOrNull()
                ?.let { it.toUser().copy(role = it.string("role")) }
                ?.also { audit(c, actor, "user.role", details = mapOf("matricula" to it.matricula, "role" to role)) }
                ?: throw ApiError("NOT_FOUND", "Matrícula no encontrada")
        }
    }

    @Volatile private var identityCache: Pair<ServerIdentity, Long>? = null

    /** This server's identity, cached 5 s so a rename from the console shows up without a restart. */
    fun serverIdentity(): ServerIdentity = identityCache?.takeIf { System.nanoTime() - it.second < 5_000_000_000L }?.first ?: db.transaction { c ->
        val row = c.rows("SELECT id::text, name FROM server_identity").single()
        ServerIdentity(row.string("id"), row.string("name"))
    }.also { identityCache = it to System.nanoTime() }

    fun renameServer(name: String, actor: String? = null): ServerIdentity {
        val clean = text(name, 80, "Nombre del servidor")
        db.transaction {
            it.exec("UPDATE server_identity SET name = ?", clean)
            audit(it, actor, "server.rename", details = mapOf("name" to clean))
        }
        identityCache = null
        return serverIdentity()
    }

    // ---- Onboarding: invitations and self sign-up (onboarding-invitations) ----

    private val codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // no 0/O/1/I
    private val random = java.security.SecureRandom()

    /** 130 random bits in base32 (26 characters). */
    private fun newInvitationCode(): String = (1..26).map { codeAlphabet[random.nextInt(32)] }.joinToString("")
    private fun newClassCode(): String = (1..8).map { codeAlphabet[random.nextInt(32)] }.joinToString("")
    private fun codeHash(code: String) = java.security.MessageDigest.getInstance("SHA-256").digest(code.trim().uppercase(Locale.ROOT).toByteArray())

    private fun pin(value: String) = value.also { if (!it.matches(Regex("\\d{6,12}"))) invalid("El PIN debe tener de 6 a 12 dígitos") }

    /** The class [classId] if [uid] owns it or is admin; NOT_FOUND / FORBIDDEN otherwise. */
    private fun managedClass(c: Connection, uid: String, classId: String): JsonObject {
        val row = c.rows("SELECT id::text, name, owner_id::text AS \"ownerId\" FROM conversations WHERE id=?::uuid AND is_class", classId).firstOrNull()
            ?: throw ApiError("NOT_FOUND", "Clase no encontrada")
        if (row.optional("ownerId") != uid && role(c, uid) != "admin") throw ApiError("FORBIDDEN", "Solo el responsable de la clase puede hacerlo")
        return row
    }

    data class NewInvitation(val id: String, val matricula: String, val name: String, val classId: String?, val expiresAt: String, val code: String) {
        fun toJson() = obj("id" to id, "matricula" to matricula, "name" to name, "classId" to classId, "expiresAt" to expiresAt)
    }

    private fun createInvitations(c: Connection, uid: String?, rows: List<Pair<String, String>>, classId: String?, days: Int): List<NewInvitation> {
        if (days !in 1..30) invalid("La invitación dura de 1 a 30 días")
        if (rows.isEmpty() || rows.size > 200) invalid("De 1 a 200 invitaciones por solicitud")
        val admin = uid == null || role(c, uid) == "admin"
        if (classId != null) {
            if (uid != null) managedClass(c, uid, classId) else c.rows("SELECT 1 AS ok FROM conversations WHERE id=?::uuid AND is_class", classId).firstOrNull() ?: throw ApiError("NOT_FOUND", "Clase no encontrada")
        } else if (!admin) {
            throw ApiError("FORBIDDEN", "Un profesor invita a una de sus clases")
        }
        val normalized = rows.map { (m, n) -> matricula(m) to text(n, 120, "Nombre") }
        if (normalized.map { it.first }.toSet().size != normalized.size) invalid("Hay matrículas repetidas")
        if (!admin) {
            val existing = normalized.filter { (m, _) -> c.rows("SELECT 1 AS ok FROM users WHERE matricula=? AND status='active'", m).isNotEmpty() }.map { it.first }
            if (existing.isNotEmpty()) throw ApiError("CONFLICT", "Ya tienen cuenta (añádelas a la clase): ${existing.take(10).joinToString()}", obj("matriculas" to existing))
        }
        audit(c, uid, "invite.create", classId, mapOf("count" to normalized.size, "matriculas" to normalized.take(50).map { it.first }, "days" to days))
        return normalized.map { (m, n) ->
            val code = newInvitationCode()
            val row = c.rows(
                """
                INSERT INTO invitations(id,code_hash,matricula,name,class_id,created_by,may_reset,expires_at)
                VALUES (?::uuid,?,?,?,?::uuid,?::uuid,?, now() + make_interval(days => ?)) RETURNING id::text, expires_at AS "expiresAt"
                """,
                UUID.randomUUID().toString(), codeHash(code), m, n, classId, uid, admin, days,
            ).single()
            NewInvitation(row.string("id"), m, n, classId, row.string("expiresAt"), code)
        }
    }

    /** Parses `matricula,nombre` lines (header optional, `;` also accepted). */
    fun parseRoster(csv: String): List<Pair<String, String>> = csv.lineSequence().map { it.trim() }.filter { it.isNotEmpty() }
        .map { line -> line.split(Regex("[,;\t]"), limit = 2).map { it.trim().removeSurrounding("\"") } }
        .filterIndexed { i, cells -> !(i == 0 && cells[0].lowercase(Locale.ROOT).startsWith("matr")) }
        .map { cells -> if (cells.size < 2 || cells[1].isBlank()) invalid("Cada línea lleva matrícula y nombre: ${cells[0]}") else cells[0] to cells[1] }
        .toList()

    fun className(classId: String): String = db.transaction { c -> c.rows("SELECT name FROM conversations WHERE id=?::uuid", classId).single().string("name") }

    /** Console: invitations created by the installation itself (admin rights). */
    fun adminInvitations(rows: List<Pair<String, String>>, classId: String?, days: Int): List<NewInvitation> = db.transaction { c -> createInvitations(c, null, rows, classId?.let(::uuid), days) }

    /**
     * Redeems [code] with the PIN the student chose: creates or activates the account, joins the
     * class and consumes the invitation, all or nothing. Used, expired, revoked and unknown codes
     * are indistinguishable.
     */
    fun redeemInvitation(code: String, pin: String): User {
        val hash = Pins.hash(pin(pin))
        return db.transaction { c ->
            val invitation = c.rows(
                """
                UPDATE invitations SET used_at = now()
                WHERE code_hash = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
                RETURNING matricula, name, class_id::text AS "classId", may_reset AS "mayReset"
                """,
                codeHash(code),
            ).firstOrNull() ?: throw ApiError("INVITATION_INVALID", "La invitación no es válida o ya se usó")
            val matricula = invitation.string("matricula")
            val existing = c.rows("SELECT id::text, status FROM users WHERE matricula=? FOR UPDATE", matricula).firstOrNull()
            val id = when {
                existing == null -> UUID.randomUUID().toString().also {
                    c.exec("INSERT INTO users(id,matricula,name,pin_hash) VALUES (?::uuid,?,?,?)", it, matricula, invitation.string("name"), hash)
                }

                existing.string("status") == "pending" || invitation["mayReset"]!!.jsonPrimitive.boolean -> existing.string("id").also {
                    c.exec("UPDATE users SET status='active', pin_hash=?, credential_version=credential_version+1 WHERE id=?::uuid", hash, it)
                    c.exec("DELETE FROM sessions WHERE user_id=?::uuid", it)
                    c.exec("DELETE FROM signup_requests WHERE user_id=?::uuid", it)
                }

                // A teacher's invitation never takes over an existing account.
                else -> throw ApiError("CONFLICT", "Esta matrícula ya tiene cuenta; entra con tu PIN")
            }
            invitation.optional("classId")?.let { cid ->
                if (c.rows("SELECT 1 AS ok FROM conversations WHERE id=?::uuid AND is_class", cid).isNotEmpty()) {
                    c.exec("INSERT INTO conversation_members(conversation_id,user_id) VALUES (?::uuid,?::uuid) ON CONFLICT DO NOTHING", cid, id)
                }
            }
            val row = c.rows("SELECT $userColumns, role, credential_version FROM users WHERE id=?::uuid", id).single()
            row.toUser().copy(role = row.string("role")).also { it.credentialVersion = row["credential_version"]!!.jsonPrimitive.int }
        }
    }

    /** Self sign-up with a class code: a pending account the class owner approves or rejects. */
    fun requestSignup(classCode: String, matricula: String, name: String, pin: String): JsonObject {
        val normalized = matricula(matricula)
        val displayName = text(name, 120, "Nombre")
        val hash = Pins.hash(pin(pin))
        return db.transaction { c ->
            val classId = c.rows("SELECT class_id::text AS id FROM class_codes WHERE code=? FOR UPDATE", classCode.trim().uppercase(Locale.ROOT)).firstOrNull()?.string("id")
                ?: throw ApiError("INVITATION_INVALID", "El código de clase no es válido")
            if (c.rows("SELECT 1 AS ok FROM users WHERE matricula=?", normalized).isNotEmpty()) throw ApiError("CONFLICT", "Esta matrícula ya tiene cuenta o una solicitud")
            val pending = c.rows("SELECT count(*) AS n FROM signup_requests WHERE class_id=?::uuid", classId).single()["n"]!!.jsonPrimitive.int
            if (pending >= 20) throw ApiError("RATE_LIMITED", "La clase tiene demasiadas solicitudes pendientes; avisa a tu profesor")
            val id = UUID.randomUUID().toString()
            c.exec("INSERT INTO users(id,matricula,name,pin_hash,status) VALUES (?::uuid,?,?,?,'pending')", id, normalized, displayName, hash)
            c.exec("INSERT INTO signup_requests(user_id,class_id) VALUES (?::uuid,?::uuid)", id, classId)
            obj("status" to "pending", "classId" to classId, "ownerId" to c.rows("SELECT owner_id::text AS o FROM conversations WHERE id=?::uuid", classId).single().string("o"))
        }
    }

    private fun onboarding(c: Connection, uid: String, operation: String, p: JsonObject): JsonObject = when (operation) {
        "invites.create" -> {
            val invitation = createInvitations(c, uid, listOf(p.string("matricula") to p.string("name")), p.optional("classId")?.let(::uuid), p.days()).single()
            obj("invitation" to invitation.toJson(), "code" to invitation.code)
        }

        "invites.import" -> {
            val created = createInvitations(c, uid, parseRoster(p.string("csv")), p.optional("classId")?.let(::uuid), p.days())
            obj("invitations" to created.map { JsonObject(it.toJson() + ("code" to json(it.code))) })
        }

        "invites.list" -> {
            val classId = p.optional("classId")?.let(::uuid)
            if (classId != null) managedClass(c, uid, classId) else requireRole(c, uid, "admin")
            obj(
                "invitations" to c.rows(
                    """
                    SELECT id::text, matricula, name, class_id::text AS "classId", expires_at AS "expiresAt",
                      CASE WHEN used_at IS NOT NULL THEN 'used' WHEN revoked_at IS NOT NULL THEN 'revoked'
                           WHEN expires_at <= now() THEN 'expired' ELSE 'open' END AS status
                    FROM invitations WHERE (?::uuid IS NULL OR class_id = ?::uuid) ORDER BY created_at DESC LIMIT 500
                    """,
                    classId,
                    classId,
                ),
            )
        }

        "invites.revoke" -> {
            val row = c.rows("SELECT class_id::text AS \"classId\" FROM invitations WHERE id=?::uuid", p.uuid("id")).firstOrNull() ?: throw ApiError("NOT_FOUND", "Invitación no encontrada")
            row.optional("classId")?.let { managedClass(c, uid, it) } ?: requireRole(c, uid, "admin")
            val revoked = c.rows("UPDATE invitations SET revoked_at = now() WHERE id=?::uuid AND used_at IS NULL AND revoked_at IS NULL RETURNING matricula", p.uuid("id")).firstOrNull()
            if (revoked != null) audit(c, uid, "invite.revoke", row.optional("classId"), mapOf("matricula" to revoked.string("matricula")))
            obj()
        }

        "classes.code" -> {
            val classId = p.uuid("classId")
            managedClass(c, uid, classId)
            val renew = (p["renew"] as? JsonPrimitive)?.booleanOrNull ?: false
            val current = c.rows("SELECT code FROM class_codes WHERE class_id=?::uuid", classId).firstOrNull()?.string("code")
            val code = if (current != null && !renew) {
                current
            } else {
                newClassCode().also {
                    c.exec("INSERT INTO class_codes(class_id,code) VALUES (?::uuid,?) ON CONFLICT (class_id) DO UPDATE SET code=EXCLUDED.code, created_at=now()", classId, it)
                    audit(c, uid, if (current == null) "class.code_create" else "class.code_renew", classId)
                }
            }
            obj("classId" to classId, "code" to code)
        }

        "signup.list" -> {
            val classId = p.optional("classId")?.let(::uuid)
            if (classId != null) managedClass(c, uid, classId)
            val admin = role(c, uid) == "admin"
            obj(
                "requests" to c.rows(
                    """
                    SELECT u.matricula, u.name, r.class_id::text AS "classId", k.name AS "className", r.created_at AS "createdAt"
                    FROM signup_requests r JOIN users u ON u.id = r.user_id JOIN conversations k ON k.id = r.class_id
                    WHERE (?::uuid IS NULL OR r.class_id = ?::uuid) AND (? OR k.owner_id = ?::uuid)
                    ORDER BY r.created_at
                    """,
                    classId,
                    classId,
                    admin,
                    uid,
                ),
            )
        }

        "signup.approve", "signup.reject" -> obj("classId" to decideSignup(c, uid, p.string("matricula"), operation == "signup.approve"))

        else -> invalid("Operación desconocida")
    }

    private fun JsonObject.days(): Int = this["days"]?.let { (it as? JsonPrimitive)?.intOrNull ?: invalid("days debe ser un número") } ?: 7

    /** Console approval: same rules as the class owner. */
    fun adminSignups(): List<JsonObject> = db.transaction { c ->
        c.rows(
            """
            SELECT u.matricula, u.name, k.name AS "className", r.created_at AS "createdAt"
            FROM signup_requests r JOIN users u ON u.id = r.user_id JOIN conversations k ON k.id = r.class_id ORDER BY r.created_at
            """,
        )
    }

    fun adminDecideSignup(matricula: String, approve: Boolean) {
        db.transaction { c -> decideSignup(c, null, matricula, approve) }
    }

    /** Approves (activates and joins the class) or rejects (deletes) a pending sign-up; [uid] null = console. */
    private fun decideSignup(c: Connection, uid: String?, matricula: String, approve: Boolean): String {
        val row = c.rows("SELECT u.id::text, r.class_id::text AS \"classId\" FROM users u JOIN signup_requests r ON r.user_id = u.id WHERE u.matricula=? FOR UPDATE OF u", matricula(matricula)).firstOrNull()
            ?: throw ApiError("NOT_FOUND", "No hay solicitud pendiente para esa matrícula")
        if (uid != null) managedClass(c, uid, row.string("classId"))
        audit(c, uid, if (approve) "signup.approve" else "signup.reject", row.string("classId"), mapOf("matricula" to matricula(matricula)))
        if (approve) {
            c.exec("UPDATE users SET status='active' WHERE id=?::uuid", row.string("id"))
            c.exec("DELETE FROM signup_requests WHERE user_id=?::uuid", row.string("id"))
            c.exec("INSERT INTO conversation_members(conversation_id,user_id) VALUES (?::uuid,?::uuid) ON CONFLICT DO NOTHING", row.string("classId"), row.string("id"))
        } else {
            c.exec("DELETE FROM users WHERE id=?::uuid AND status='pending'", row.string("id"))
        }
        return row.string("classId")
    }

    // ---- Web panel queries (admin-web-panel) ----

    fun role(uid: String): String = db.transaction { role(it, uid) }

    fun requireAdmin(uid: String) = db.transaction { requireRole(it, uid, "admin") }

    /** Classes [uid] manages: all for an admin, their own for a teacher. */
    fun panelClasses(uid: String): List<JsonObject> = db.transaction { c ->
        val admin = role(c, uid) == "admin"
        c.rows(
            """
            SELECT k.id::text, k.name, u.name AS "ownerName", (k.owner_id = ?::uuid) AS "isOwner",
              (SELECT count(*) FROM conversation_members m WHERE m.conversation_id = k.id) AS members,
              (SELECT count(*) FROM signup_requests r WHERE r.class_id = k.id) AS pending
            FROM conversations k JOIN users u ON u.id = k.owner_id
            WHERE k.is_class AND (? OR k.owner_id = ?::uuid) ORDER BY k.name, k.id
            """,
            uid,
            admin,
            uid,
        )
    }

    /** A managed class with its members; NOT_FOUND / FORBIDDEN like the protocol. */
    fun panelClass(uid: String, classId: String): JsonObject = db.transaction { c ->
        val row = managedClass(c, uid, uuid(classId))
        val members = c.rows(
            """
            SELECT u.matricula, u.name, u.role FROM conversation_members m JOIN users u ON u.id = m.user_id
            WHERE m.conversation_id = ?::uuid ORDER BY u.name, u.matricula
            """,
            row.string("id"),
        )
        JsonObject(row + ("isOwner" to json(row.optional("ownerId") == uid)) + ("members" to JsonArray(members)))
    }

    /** Class CSV for its owner or an admin. */
    fun classAttendanceCsv(uid: String, classId: String, from: String?, to: String?): String {
        db.transaction { managedClass(it, uid, uuid(classId)) }
        return attendanceCsv(null, obj("classId" to classId, "from" to from, "to" to to))
    }

    /** Accounts for the admin page: optional search, at most 200. */
    fun panelUsers(query: String?): List<JsonObject> = db.transaction { c ->
        val q = query?.trim()?.takeIf { it.isNotEmpty() }
        c.rows(
            """
            SELECT $userColumns, role, status,
              (SELECT count(*) FROM sessions s WHERE s.user_id = users.id AND s.expires_at > now()) AS sessions
            FROM users WHERE (?::text IS NULL OR strpos(lower(matricula), lower(?))>0 OR strpos(lower(name), lower(?))>0)
            ORDER BY matricula LIMIT 200
            """,
            q,
            q,
            q,
        )
    }

    /** Audit entries newest first: all for an admin, only their classes for a teacher. */
    fun auditLog(uid: String, from: String?, to: String?, before: Long?, limit: Int = 50): JsonObject = db.transaction { c ->
        val admin = role(c, uid) == "admin"
        val start = date(from)?.atStartOfDay(zone)?.toInstant()
        val end = date(to)?.plusDays(1)?.atStartOfDay(zone)?.toInstant()
        val rows = c.rows(
            """
            SELECT a.id, a.at, a.action, a.details::text AS details, k.name AS "className", u.matricula AS actor
            FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id LEFT JOIN conversations k ON k.id = a.class_id
            WHERE (? OR k.owner_id = ?::uuid)
              AND (?::bigint IS NULL OR a.id < ?::bigint)
              AND (?::timestamptz IS NULL OR a.at >= ?::timestamptz) AND (?::timestamptz IS NULL OR a.at < ?::timestamptz)
            ORDER BY a.id DESC LIMIT ?
            """,
            admin, uid, before, before, start, start, end, end, limit + 1,
        )
        val page = rows.take(limit)
        obj("entries" to page, "nextCursor" to if (rows.size > limit) page.last()["id"].toString() else null)
    }
}
