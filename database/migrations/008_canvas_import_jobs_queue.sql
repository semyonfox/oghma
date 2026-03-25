-- ============================================================================
-- Migration: 008 - Canvas Import Jobs Queue
-- Date: 2025-03-19
-- Description:
--   Adds a job queue table for Canvas imports to enable asynchronous processing
-- ============================================================================

CREATE TABLE IF NOT EXISTS app.canvas_import_jobs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    course_ids          JSONB NOT NULL,
    status              TEXT NOT NULL DEFAULT 'queued',
    error_message       TEXT,
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canvas_import_jobs_user ON app.canvas_import_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_canvas_import_jobs_status ON app.canvas_import_jobs(status) WHERE status != 'complete';
CREATE INDEX IF NOT EXISTS idx_canvas_import_jobs_queue ON app.canvas_import_jobs(created_at) WHERE status = 'queued';

CREATE OR REPLACE FUNCTION update_canvas_import_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_canvas_import_jobs_updated_at_trigger ON app.canvas_import_jobs;

CREATE TRIGGER update_canvas_import_jobs_updated_at_trigger
BEFORE UPDATE ON app.canvas_import_jobs
FOR EACH ROW
EXECUTE FUNCTION update_canvas_import_jobs_updated_at();

SELECT 'Canvas import jobs queue created' as status;
