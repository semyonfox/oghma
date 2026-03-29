-- add vault import/export support to the jobs table
-- type: 'canvas' (default), 'vault-import', 'vault-export'
-- input_s3_key: S3 key of uploaded zip for import
-- output_s3_key: S3 key of generated zip for export
-- download_url: presigned download URL for completed exports

ALTER TABLE app.canvas_import_jobs
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'canvas',
  ADD COLUMN IF NOT EXISTS input_s3_key TEXT,
  ADD COLUMN IF NOT EXISTS output_s3_key TEXT,
  ADD COLUMN IF NOT EXISTS download_url TEXT;
