-- 054_marker_serverless_jobs.sql creates the canonical base table. This
-- defensive CREATE keeps older installations that recorded a pre-repair
-- migration identity recoverable, then the ALTERs add the Vast dispatch state.
CREATE TABLE IF NOT EXISTS app.marker_jobs (
    callback_id UUID PRIMARY KEY,
    runpod_job_id TEXT UNIQUE,
    note_id UUID NOT NULL REFERENCES app.notes(note_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    canvas_job_id UUID REFERENCES app.canvas_import_jobs(id) ON DELETE SET NULL,
    parent_folder_id UUID REFERENCES app.notes(note_id) ON DELETE SET NULL,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    source_key TEXT NOT NULL,
    result_key TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_marker_jobs_note
    ON app.marker_jobs(note_id, created_at DESC);

ALTER TABLE app.marker_jobs
    ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'runpod',
    ADD COLUMN IF NOT EXISTS provider_job_id TEXT,
    ADD COLUMN IF NOT EXISTS source_bytes BIGINT,
    ADD COLUMN IF NOT EXISTS dispatch_attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS provider_metrics JSONB,
    ADD COLUMN IF NOT EXISTS completion_attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS completion_enqueued_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS completion_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS result_bytes BIGINT,
    ADD COLUMN IF NOT EXISTS result_sha256 TEXT;

UPDATE app.marker_jobs
SET provider_job_id = runpod_job_id
WHERE provider_job_id IS NULL
  AND runpod_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marker_jobs_provider_job
    ON app.marker_jobs(provider, provider_job_id)
    WHERE provider_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marker_jobs_status
    ON app.marker_jobs(provider, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_marker_jobs_completion_recovery
    ON app.marker_jobs(status, updated_at)
    WHERE status IN (
      'completion_queued', 'completion_enqueue_failed', 'completion_retry',
      'completing', 'failure_queued', 'failure_enqueue_failed', 'failing'
    );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'app.marker_jobs'::regclass
      AND conname = 'marker_jobs_attempts_nonnegative'
  ) THEN
    ALTER TABLE app.marker_jobs
      ADD CONSTRAINT marker_jobs_attempts_nonnegative
      CHECK (dispatch_attempts >= 0 AND completion_attempts >= 0);
  END IF;
END $$;

COMMENT ON TABLE app.marker_jobs IS
    'Durable Oghma-owned state for asynchronous Marker serverless dispatch.';

COMMENT ON COLUMN app.marker_jobs.provider_metrics IS
    'Small provider routing and latency summary; never signed URLs, payloads, or credentials.';

COMMENT ON COLUMN app.marker_jobs.result_sha256 IS
    'SHA-256 of the validated v1 Marker result object; used for completion auditability.';
