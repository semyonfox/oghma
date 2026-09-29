ALTER TABLE app.canvas_imports
  ADD COLUMN IF NOT EXISTS source_s3_key TEXT;

ALTER TABLE app.notes
  ADD COLUMN IF NOT EXISTS canvas_import_id UUID REFERENCES app.canvas_imports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notes_canvas_import_id
  ON app.notes(user_id, canvas_import_id)
  WHERE canvas_import_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_canvas_pending_extract
  ON app.canvas_imports(updated_at)
  WHERE status = 'pending_extract';
