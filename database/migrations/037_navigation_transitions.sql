-- Navigation observations stay event-level and intentionally cannot be joined into journeys.
-- They contain only allowlisted paths and coarse origin / UI context; no identifier or storage key.
ALTER TABLE app.marketing_events
    ADD COLUMN IF NOT EXISTS from_path TEXT,
    ADD COLUMN IF NOT EXISTS to_path TEXT,
    ADD COLUMN IF NOT EXISTS origin_class TEXT,
    ADD COLUMN IF NOT EXISTS placement TEXT,
    ADD COLUMN IF NOT EXISTS action TEXT;

ALTER TABLE app.marketing_events
    DROP CONSTRAINT IF EXISTS marketing_events_navigation_origin_class,
    ADD CONSTRAINT marketing_events_navigation_origin_class
        CHECK (origin_class IS NULL OR origin_class IN ('direct', 'external', 'internal'));

CREATE INDEX IF NOT EXISTS idx_marketing_events_navigation_aggregate
    ON app.marketing_events (to_path, from_path, origin_class, placement, action, occurred_at DESC)
    WHERE event_name = 'navigation_transition';

COMMENT ON COLUMN app.marketing_events.from_path IS
    'Allowlisted prior application path only; no query string or fragment.';
COMMENT ON COLUMN app.marketing_events.to_path IS
    'Allowlisted destination application path only; no query string or fragment.';
COMMENT ON COLUMN app.marketing_events.origin_class IS
    'Coarse navigation origin: direct, external, or internal.';
COMMENT ON COLUMN app.marketing_events.placement IS
    'Allowlisted semantic UI placement such as header, footer, or CTA region.';
COMMENT ON COLUMN app.marketing_events.action IS
    'Allowlisted semantic action such as nav_link or an existing CTA name.';
