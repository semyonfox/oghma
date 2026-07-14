-- Prevent concurrent vault-import starts from creating multiple active jobs.
CREATE UNIQUE INDEX IF NOT EXISTS canvas_import_jobs_one_active_vault_import_per_user
  ON app.canvas_import_jobs (user_id, type)
  WHERE type = 'vault-import' AND status IN ('queued', 'processing');
