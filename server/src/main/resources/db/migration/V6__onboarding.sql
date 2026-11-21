-- Accounts created by self sign-up wait as 'pending' until their teacher approves them.
ALTER TABLE users ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending'));

-- Personal invitations: only the SHA-256 of the code is stored, like session tokens.
CREATE TABLE invitations (
    id uuid PRIMARY KEY,
    code_hash bytea NOT NULL UNIQUE,
    matricula varchar(32) NOT NULL,
    name varchar(120) NOT NULL,
    class_id uuid REFERENCES conversations(id),
    created_by uuid REFERENCES users(id) ON DELETE SET NULL,
    -- Only admins may invite an existing account (the invitation then resets its PIN).
    may_reset boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    revoked_at timestamptz
);
CREATE INDEX invitations_class ON invitations(class_id, created_at DESC);

-- One renewable sign-up code per class.
CREATE TABLE class_codes (
    class_id uuid PRIMARY KEY REFERENCES conversations(id),
    code char(8) NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE signup_requests (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    class_id uuid NOT NULL REFERENCES conversations(id),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX signup_requests_class ON signup_requests(class_id, created_at);
