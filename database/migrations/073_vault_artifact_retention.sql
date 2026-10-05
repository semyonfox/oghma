CREATE TABLE app.vault_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('upload', 'export')),
  s3_key text NOT NULL UNIQUE,
  job_id uuid REFERENCES app.canvas_import_jobs(id) ON DELETE SET NULL,
  reserved_bytes bigint NOT NULL CHECK (reserved_bytes >= 0),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  is_current boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX vault_artifacts_current_slot ON app.vault_artifacts(user_id, kind) WHERE is_current;
CREATE INDEX vault_artifacts_expiry ON app.vault_artifacts(expires_at);

-- existing links keep their remaining lifetime; the worker expires their archives
INSERT INTO app.vault_artifacts (user_id, kind, s3_key, job_id, reserved_bytes, expires_at, is_current)
SELECT DISTINCT ON (output_s3_key) user_id, 'export', output_s3_key, id, 0,
  COALESCE(completed_at, created_at) + INTERVAL '24 hours', false
FROM app.canvas_import_jobs
WHERE type = 'vault-export' AND output_s3_key IS NOT NULL
  AND status NOT IN ('queued', 'processing')
  AND COALESCE(completed_at, created_at) > NOW() - INTERVAL '24 hours'
ORDER BY output_s3_key, COALESCE(completed_at, created_at) DESC;

UPDATE app.vault_artifacts SET is_current = true
WHERE id IN (
  SELECT DISTINCT ON (user_id) id FROM app.vault_artifacts
  WHERE kind = 'export' ORDER BY user_id, expires_at DESC, id
);

-- expired known archives join the same retryable cleanup journal
INSERT INTO app.note_deletion_cleanup_tasks (user_id, object_keys)
SELECT user_id, array_agg(output_s3_key)
FROM app.canvas_import_jobs
WHERE type = 'vault-export' AND output_s3_key IS NOT NULL
  AND status NOT IN ('queued', 'processing')
  AND COALESCE(completed_at, created_at) <= NOW() - INTERVAL '24 hours'
GROUP BY user_id;
