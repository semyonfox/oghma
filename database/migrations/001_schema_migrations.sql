-- creates the migration tracking table
-- this migration is self-referential: the runner records it after applying
CREATE TABLE IF NOT EXISTS app.schema_migrations (
    version  TEXT PRIMARY KEY,
    name     TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
