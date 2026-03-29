-- oauth support: add profile columns to app.login and create oauth_accounts table
-- run with: node scripts/run-migration.mjs 002_oauth_accounts.sql

-- add oauth profile columns to app.login (used by auth-oauth.ts syncProfileToLogin)
ALTER TABLE app.login
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS locale TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- oauth accounts table: stores provider linkage for each user
CREATE TABLE IF NOT EXISTS app.oauth_accounts (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    provider       TEXT NOT NULL,
    provider_id    TEXT NOT NULL,
    email          TEXT,
    name           TEXT,
    avatar_url     TEXT,
    locale         TEXT,
    raw_profile    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user ON app.oauth_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider ON app.oauth_accounts(provider, provider_id);

COMMENT ON TABLE app.oauth_accounts IS 'OAuth provider accounts linked to users. One user can have multiple providers.';
