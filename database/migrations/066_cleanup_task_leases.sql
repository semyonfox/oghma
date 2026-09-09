-- External cleanup must not hold a transaction idle while object storage works.
-- A token fences acknowledgements from an old worker after its lease expires.
ALTER TABLE app.note_deletion_cleanup_tasks
  ADD COLUMN lease_token UUID,
  ADD COLUMN lease_expires_at TIMESTAMPTZ;
