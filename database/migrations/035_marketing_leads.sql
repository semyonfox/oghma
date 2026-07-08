-- First-party lead capture for website/contact form submissions.
-- Unlike anonymous marketing_events, this table stores contact details that a
-- visitor explicitly submits through the contact form.

CREATE TABLE IF NOT EXISTS app.marketing_leads (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name              TEXT NOT NULL,
    last_name               TEXT NOT NULL,
    email                   TEXT NOT NULL,
    role                    TEXT NOT NULL,
    interest                TEXT NOT NULL,
    institution             TEXT,
    phone                   TEXT,
    message                 TEXT NOT NULL,
    source                  TEXT,
    session_id              TEXT,
    utm_source              TEXT,
    utm_medium              TEXT,
    utm_campaign            TEXT,
    utm_content             TEXT,
    utm_term                TEXT,
    first_touch             JSONB NOT NULL DEFAULT '{}'::jsonb,
    forwarded_to_web3forms  BOOLEAN NOT NULL DEFAULT FALSE,
    forward_error           TEXT,
    user_agent              TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_leads_created_at
    ON app.marketing_leads(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_leads_interest_created_at
    ON app.marketing_leads(interest, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_leads_utm_campaign_created_at
    ON app.marketing_leads(utm_campaign, created_at DESC)
    WHERE utm_campaign IS NOT NULL;

COMMENT ON TABLE app.marketing_leads IS
    'First-party contact form leads submitted intentionally by visitors. Contains contact details; keep separate from anonymous marketing_events.';
