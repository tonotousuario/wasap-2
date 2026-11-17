package wasap

import kotlinx.serialization.json.*
import java.security.MessageDigest
import java.time.Instant

/** A session as persisted: identified only by the SHA-256 of its token. */
data class StoredSession(val user: User, val credentialVersion: Int, val expiresAt: Instant)

/** Durable session storage. Implementations never see or keep the clear-text token. */
interface SessionStore {
    /**
     * Saves a new session for [user] and enforces at most [keep] live sessions per user by
     * deleting expired ones and those expiring soonest. Returns the hashes it deleted.
     */
    fun insert(hash: String, user: User, credentialVersion: Int, expiresAt: Instant, keep: Int): List<String>

    /** The session if it exists, has not expired and its credential version is current. */
    fun find(hash: String): StoredSession?

    /** Whether the session still exists, has not expired and [credentialVersion] is current. */
    fun isValid(hash: String, credentialVersion: Int): Boolean
    fun delete(hash: String)
    fun purgeExpired(): Int
}

/** Hex SHA-256 of a session token; the only form in which a token is stored or indexed. */
fun tokenHash(token: String): String = MessageDigest.getInstance("SHA-256").digest(token.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }

class DatabaseSessionStore(private val db: Database) : SessionStore {
    override fun insert(hash: String, user: User, credentialVersion: Int, expiresAt: Instant, keep: Int): List<String> = db.transaction { c ->
        // Serialize logins of the same user so the per-account limit holds under concurrency.
        c.rows("SELECT id FROM users WHERE id=?::uuid FOR NO KEY UPDATE", user.id).ifEmpty { throw ApiError("UNAUTHENTICATED", "Usuario no encontrado") }
        val expired = c.rows("DELETE FROM sessions WHERE user_id=?::uuid AND expires_at <= now() RETURNING encode(token_hash,'hex') AS h", user.id)
        val surplus = c.rows(
            """
            DELETE FROM sessions WHERE token_hash IN (
                SELECT token_hash FROM sessions WHERE user_id=?::uuid ORDER BY expires_at DESC OFFSET ?)
            RETURNING encode(token_hash,'hex') AS h
        """,
            user.id,
            keep - 1,
        )
        c.exec("INSERT INTO sessions(token_hash,user_id,credential_version,expires_at) VALUES (decode(?,'hex'),?::uuid,?,?)", hash, user.id, credentialVersion, expiresAt)
        (expired + surplus).map { it.string("h") }
    }

    override fun find(hash: String): StoredSession? = db.transaction { c ->
        c.rows(
            """
            SELECT u.id::text AS id, u.matricula, u.name, s.credential_version AS version, s.expires_at AS "expiresAt"
            FROM sessions s JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = decode(?,'hex') AND s.expires_at > now() AND s.credential_version = u.credential_version
        """,
            hash,
        ).firstOrNull()?.let { row ->
            StoredSession(User(row.string("id"), row.string("matricula"), row.string("name")), row["version"]!!.jsonPrimitive.int, Instant.parse(row.string("expiresAt")))
        }
    }

    override fun isValid(hash: String, credentialVersion: Int): Boolean = db.transaction { c ->
        c.rows(
            """
            SELECT 1 AS ok FROM sessions s JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = decode(?,'hex') AND s.expires_at > now()
              AND s.credential_version = ? AND u.credential_version = s.credential_version
        """,
            hash,
            credentialVersion,
        ).isNotEmpty()
    }

    override fun delete(hash: String) {
        db.transaction { it.exec("DELETE FROM sessions WHERE token_hash = decode(?,'hex')", hash) }
    }

    override fun purgeExpired(): Int = db.transaction { it.exec("DELETE FROM sessions WHERE expires_at <= now()") }
}
