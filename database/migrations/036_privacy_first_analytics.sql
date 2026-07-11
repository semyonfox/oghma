-- Remove browser-linkable marketing data. Anonymous funnel reporting is aggregate-only.
DROP INDEX IF EXISTS app.idx_marketing_events_session_time;
ALTER TABLE app.marketing_events
    DROP COLUMN IF EXISTS session_id,
    DROP COLUMN IF EXISTS user_agent;

ALTER TABLE app.marketing_leads
    DROP COLUMN IF EXISTS session_id,
    DROP COLUMN IF EXISTS user_agent;

COMMENT ON TABLE app.marketing_events IS
    'Minimized first-party funnel events: no browser identifier, user agent, raw IP, query string, content, credentials, email, or name.';

-- Raw observations are short-lived; this function is intended for the existing
-- deployment scheduler/maintenance job. Aggregates may be retained longer.
CREATE OR REPLACE FUNCTION app.purge_expired_marketing_events(
    retention interval DEFAULT interval '30 days'
) RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE deleted_count bigint;
BEGIN
    DELETE FROM app.marketing_events WHERE created_at < now() - retention;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;
