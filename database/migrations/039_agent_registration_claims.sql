-- auth.md v1: agent-initiated registration claims for previously unknown users.
-- This table deliberately does not issue API credentials. A claim only proves that
-- the email owner completed the normal OghmaNotes registration and verification flow.
CREATE TABLE IF NOT EXISTS app.agent_registration_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    claim_token_hash TEXT NOT NULL UNIQUE,
    user_code_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'registered', 'verified')),
    created_user_id UUID REFERENCES app.login(user_id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    registered_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_registration_claims_open_email
    ON app.agent_registration_claims (LOWER(email))
    WHERE status IN ('pending', 'registered');

CREATE INDEX IF NOT EXISTS idx_agent_registration_claims_token_expiry
    ON app.agent_registration_claims (claim_token_hash, expires_at);

COMMENT ON TABLE app.agent_registration_claims IS
    'Short-lived auth.md claims that let an agent begin registration for a new user; no API credentials are issued.';
