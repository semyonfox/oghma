-- Make vault export starts idempotent under concurrent requests. Retain an
-- already-processing export over queued duplicates before adding the guard.
WITH ranked_active_exports AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY (status = 'processing') DESC, created_at ASC, id ASC
    ) AS active_rank
  FROM app.canvas_import_jobs
  WHERE type = 'vault-export'
    AND status IN ('queued', 'processing')
)
UPDATE app.canvas_import_jobs AS job
SET status = 'cancelled',
    completed_at = COALESCE(job.completed_at, NOW()),
    cancel_requested_at = COALESCE(job.cancel_requested_at, NOW()),
    updated_at = NOW()
FROM ranked_active_exports AS ranked
WHERE job.id = ranked.id
  AND ranked.active_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS canvas_import_jobs_one_active_vault_export_per_user
  ON app.canvas_import_jobs (user_id, type)
  WHERE type = 'vault-export' AND status IN ('queued', 'processing');
