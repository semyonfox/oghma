-- Fast lookups when deduplicating file imports.
-- Allows the import pipeline to cheaply check whether a canvas_file_id
-- has already been successfully imported for a given user before downloading.
CREATE INDEX IF NOT EXISTS canvas_imports_dedup_idx
  ON app.canvas_imports (user_id, canvas_file_id)
  WHERE status = 'complete';
