-- Persistent sessions. Only the SHA-256 of each 256-bit random token is stored.
CREATE TABLE sessions (
    token_hash bytea PRIMARY KEY CHECK (octet_length(token_hash) = 32),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_version integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_expiry ON sessions(user_id, expires_at);
CREATE INDEX sessions_expiry ON sessions(expires_at);
