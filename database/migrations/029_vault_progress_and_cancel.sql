-- 029: vault job progress + cooperative cancellation
ALTER TABLE app.canvas_import_jobs
  ADD COLUMN IF NOT EXISTS processed_files INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_canvas_import_jobs_cancel
  ON app.canvas_import_jobs (id)
  WHERE cancel_requested_at IS NOT NULL;
