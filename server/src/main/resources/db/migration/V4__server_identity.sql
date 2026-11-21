-- Stable identity of this server: announced in server.hello, embedded in its QR and the
-- anchor for future federation. Lives with the data so backups and extra instances keep it.
CREATE TABLE server_identity (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    id uuid NOT NULL UNIQUE,
    name varchar(80) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO server_identity (id, name) VALUES (gen_random_uuid(), 'Wasap');
