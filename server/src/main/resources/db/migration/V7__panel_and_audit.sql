-- Who did what: administrative actions, written in the same transaction as the action.
CREATE TABLE audit_log (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    at timestamptz NOT NULL DEFAULT now(),
    actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
    action text NOT NULL,
    class_id uuid REFERENCES conversations(id),
    details jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX audit_at ON audit_log(at DESC);
CREATE INDEX audit_class_at ON audit_log(class_id, at DESC) WHERE class_id IS NOT NULL;

-- Web panel sessions: SHA-256 of the cookie token, 8 h absolute and 30 min idle lifetime.
CREATE TABLE panel_sessions (
    token_hash bytea PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX panel_sessions_user ON panel_sessions(user_id);
