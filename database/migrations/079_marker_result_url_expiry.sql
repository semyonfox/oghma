-- 079_marker_result_url_expiry.sql
-- expiry of the signed result upload URL issued at dispatch. once it passes,
-- no worker can deliver a result, so observation can stop waiting
ALTER TABLE app.marker_jobs
    ADD COLUMN IF NOT EXISTS result_url_expires_at TIMESTAMPTZ;
