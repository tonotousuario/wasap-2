-- When each idempotent request was processed, so old records can be purged.
ALTER TABLE processed_requests ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX processed_requests_created_at ON processed_requests(created_at);
