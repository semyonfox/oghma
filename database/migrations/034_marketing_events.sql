-- Privacy-light first-party marketing and funnel events.
-- No cookies, raw IP addresses, emails, names, note text, Canvas tokens, or
-- document content should be written here.

CREATE TABLE IF NOT EXISTS app.marketing_events (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name     TEXT NOT NULL,
    session_id     TEXT,
    user_id        UUID REFERENCES app.login(user_id) ON DELETE SET NULL,
    path           TEXT,
    referrer       TEXT,
    source         TEXT,
    target_url     TEXT,
    utm_source     TEXT,
    utm_medium     TEXT,
    utm_campaign   TEXT,
    utm_content    TEXT,
    utm_term       TEXT,
    properties     JSONB NOT NULL DEFAULT '{}'::jsonb,
    user_agent     TEXT,
    occurred_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT marketing_events_event_name_length
        CHECK (char_length(event_name) BETWEEN 1 AND 96),
    CONSTRAINT marketing_events_session_id_length
        CHECK (session_id IS NULL OR char_length(session_id) <= 96)
);

CREATE INDEX IF NOT EXISTS idx_marketing_events_event_time
    ON app.marketing_events(event_name, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_events_session_time
    ON app.marketing_events(session_id, occurred_at DESC)
    WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marketing_events_user_time
    ON app.marketing_events(user_id, occurred_at DESC)
    WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marketing_events_utm_campaign_time
    ON app.marketing_events(utm_campaign, occurred_at DESC)
    WHERE utm_campaign IS NOT NULL;

COMMENT ON TABLE app.marketing_events IS
    'First-party, privacy-light marketing funnel events. Store event metadata only; do not store content, credentials, raw IPs, emails, names, or messages.';
