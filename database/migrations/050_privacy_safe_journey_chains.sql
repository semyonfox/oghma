-- Bounded, allowlisted journey context without a visitor or session identifier.
-- The browser keeps at most four public paths in memory and sends the complete
-- chain with an individual observation. Chains reset on refresh/tab closure and
-- cannot be joined into longer visitor trails.
ALTER TABLE app.marketing_events
    ADD COLUMN IF NOT EXISTS path_chain TEXT[],
    ADD COLUMN IF NOT EXISTS attribution_path TEXT,
    ADD COLUMN IF NOT EXISTS attribution_placement TEXT,
    ADD COLUMN IF NOT EXISTS attribution_action TEXT;

ALTER TABLE app.marketing_events
    DROP CONSTRAINT IF EXISTS marketing_events_path_chain_length,
    ADD CONSTRAINT marketing_events_path_chain_length
        CHECK (
            path_chain IS NULL
            OR cardinality(path_chain) BETWEEN 1 AND 4
        );

CREATE INDEX IF NOT EXISTS idx_marketing_events_journey_aggregate
    ON app.marketing_events (
        path_chain,
        attribution_action,
        attribution_placement,
        occurred_at DESC
    )
    WHERE event_name = 'navigation_transition'
      AND cardinality(path_chain) >= 2;

COMMENT ON COLUMN app.marketing_events.path_chain IS
    'One bounded observation containing up to four allowlisted public paths; no journey/session identifier.';
COMMENT ON COLUMN app.marketing_events.attribution_path IS
    'Allowlisted public page where the most recent in-memory CTA was activated.';
COMMENT ON COLUMN app.marketing_events.attribution_placement IS
    'Allowlisted placement of the most recent in-memory CTA in this bounded chain.';
COMMENT ON COLUMN app.marketing_events.attribution_action IS
    'Allowlisted action of the most recent in-memory CTA in this bounded chain.';
