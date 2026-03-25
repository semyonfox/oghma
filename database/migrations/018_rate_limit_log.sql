-- rate limit audit log — stores violations only (blocked requests)
-- identifiers are SHA256-hashed for PII protection

CREATE TABLE IF NOT EXISTS app.rate_limit_log (
    id          BIGSERIAL PRIMARY KEY,
    category    TEXT NOT NULL,
    identifier  TEXT NOT NULL,
    blocked     BOOLEAN NOT NULL DEFAULT true,
    count       INTEGER NOT NULL,
    limit_max   INTEGER NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rate_limit_log_created ON app.rate_limit_log (created_at);
CREATE INDEX idx_rate_limit_log_category ON app.rate_limit_log (category, created_at);

-- track migration
INSERT INTO app.schema_migrations (version, name)
VALUES (18, '018_rate_limit_log')
ON CONFLICT (version) DO NOTHING;
