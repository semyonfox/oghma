-- Additive only. Reclamation stays disabled until every worker understands
-- these claims. Never enable it while an older worker can still publish.
ALTER TABLE app.canvas_import_jobs
  ADD COLUMN IF NOT EXISTS request_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS claim_token UUID,
  ADD COLUMN IF NOT EXISTS claim_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS execution_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discovery_progress JSONB,
  ADD COLUMN IF NOT EXISTS source_job_id UUID REFERENCES app.canvas_import_jobs(id),
  ADD COLUMN IF NOT EXISTS result_summary JSONB;

ALTER TABLE app.canvas_imports
  ADD COLUMN IF NOT EXISTS claim_token UUID,
  ADD COLUMN IF NOT EXISTS claim_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS execution_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retry_seq INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retry_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retryable BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE app.imported_file_cache
  ADD COLUMN IF NOT EXISTS owner_import_id UUID REFERENCES app.canvas_imports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_job_id UUID REFERENCES app.canvas_import_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_canvas_cache_waiters
  ON app.canvas_imports(imported_file_cache_id) WHERE status = 'pending_cache';

CREATE INDEX IF NOT EXISTS idx_canvas_imports_expired_claim
  ON app.canvas_imports(claim_expires_at)
  WHERE status IN ('downloading', 'processing', 'indexing');
CREATE INDEX IF NOT EXISTS idx_canvas_jobs_expired_claim
  ON app.canvas_import_jobs(claim_expires_at) WHERE status = 'discovering';
CREATE INDEX IF NOT EXISTS idx_canvas_retry_due
  ON app.canvas_imports(next_attempt_at) WHERE status = 'pending_retry';

-- Existing deployments may contain duplicate active runs. Fail rather than
-- cancelling user work in a schema migration; the runbook covers preflight.
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_canvas_run_per_user
  ON app.canvas_import_jobs(user_id)
  WHERE type = 'canvas' AND status IN ('queued', 'discovering', 'processing');
