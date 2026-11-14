CREATE TABLE users (
    id uuid PRIMARY KEY,
    matricula varchar(32) NOT NULL UNIQUE,
    name varchar(120) NOT NULL,
    pin_hash text NOT NULL,
    credential_version integer NOT NULL DEFAULT 1
);
CREATE TABLE attendance_events (
    id uuid PRIMARY KEY,
    seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
    user_id uuid NOT NULL REFERENCES users(id),
    type text NOT NULL CHECK (type IN ('ENTRY','EXIT')),
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX attendance_user_seq ON attendance_events(user_id, seq DESC);
CREATE INDEX attendance_date ON attendance_events(recorded_at);
CREATE TABLE conversations (
    id uuid PRIMARY KEY,
    kind text NOT NULL CHECK (kind IN ('GENERAL','DIRECT','GROUP')),
    name varchar(120) NOT NULL,
    owner_id uuid REFERENCES users(id),
    direct_key text UNIQUE,
    last_seq bigint NOT NULL DEFAULT 0,
    CHECK ((kind='GROUP') = (owner_id IS NOT NULL)),
    CHECK ((kind='DIRECT') = (direct_key IS NOT NULL))
);
CREATE UNIQUE INDEX one_general ON conversations(kind) WHERE kind='GENERAL';
INSERT INTO conversations(id, kind, name) VALUES ('00000000-0000-4000-8000-000000000001','GENERAL','General');
CREATE TABLE conversation_members (
    conversation_id uuid NOT NULL REFERENCES conversations(id),
    user_id uuid NOT NULL REFERENCES users(id),
    PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX memberships_user ON conversation_members(user_id);
CREATE TABLE messages (
    id uuid PRIMARY KEY,
    conversation_id uuid NOT NULL REFERENCES conversations(id),
    seq bigint NOT NULL,
    sender_id uuid NOT NULL REFERENCES users(id),
    text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 4000),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (conversation_id, seq)
);
CREATE TABLE processed_requests (
    user_id uuid NOT NULL REFERENCES users(id),
    request_id uuid NOT NULL,
    operation text NOT NULL,
    payload jsonb NOT NULL,
    result jsonb NOT NULL,
    PRIMARY KEY (user_id, request_id)
);
