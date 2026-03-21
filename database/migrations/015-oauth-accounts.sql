-- migration 015: OAuth accounts table + profile columns on login
-- date: 2026-03-21

-- new profile columns on app.login
ALTER TABLE app.login ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE app.login ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE app.login ADD COLUMN IF NOT EXISTS locale TEXT;

-- oauth accounts junction table
CREATE TABLE IF NOT EXISTS app.oauth_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    provider        TEXT NOT NULL,
    provider_id     TEXT NOT NULL,
    email           TEXT,
    name            TEXT,
    avatar_url      TEXT,
    locale          TEXT,
    raw_profile     JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id
    ON app.oauth_accounts(user_id);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider_email
    ON app.oauth_accounts(provider, email);

-- auto-update updated_at on row change
CREATE OR REPLACE FUNCTION app.update_oauth_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_oauth_accounts_updated_at ON app.oauth_accounts;
CREATE TRIGGER trg_oauth_accounts_updated_at
    BEFORE UPDATE ON app.oauth_accounts
    FOR EACH ROW
    EXECUTE FUNCTION app.update_oauth_updated_at();

COMMENT ON TABLE app.oauth_accounts IS 'OAuth provider accounts linked to app.login users. One row per provider identity.';
