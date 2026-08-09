-- Reversible note deletion and reference-aware imported-file-cache retention.
-- `trash_root_id` groups a deleted folder and every descendant into one
-- restore/purge unit. Tree rows deliberately remain intact while in Trash.

ALTER TABLE app.notes
    ADD COLUMN IF NOT EXISTS trash_root_id UUID,
    ADD COLUMN IF NOT EXISTS trash_expires_at TIMESTAMPTZ;

-- Existing soft-deleted rows predate reversible Trash. Treat each existing
-- row as an independently restorable legacy item instead of leaving it with
-- no expiry or root identity.
UPDATE app.notes
SET trash_root_id = note_id,
    trash_expires_at = COALESCE(trash_expires_at, deleted_at + INTERVAL '30 days')
WHERE deleted_at IS NOT NULL
  AND trash_root_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_notes_trash_expiry
    ON app.notes (user_id, trash_expires_at)
    WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notes_trash_root
    ON app.notes (user_id, trash_root_id)
    WHERE trash_root_id IS NOT NULL;

-- A permanent delete must not lose the identifiers needed to retry external
-- Qdrant/object-storage cleanup. Rows are retained only until both operations
-- have succeeded, then the worker removes the journal row; their delete
-- operations are idempotent.
CREATE TABLE IF NOT EXISTS app.note_deletion_cleanup_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    note_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
    chunk_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
    object_keys TEXT[] NOT NULL DEFAULT '{}'::text[],
    object_prefixes TEXT[] NOT NULL DEFAULT '{}'::text[],
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app.note_deletion_cleanup_tasks
    ADD COLUMN IF NOT EXISTS object_prefixes TEXT[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_note_deletion_cleanup_pending
    ON app.note_deletion_cleanup_tasks (created_at)
    WHERE completed_at IS NULL;

-- Imported cache rows are their own retry journal: a collector deletes the
-- row only after cache vectors and immutable storage objects are gone.
ALTER TABLE app.imported_file_cache
    ADD COLUMN IF NOT EXISTS orphaned_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS purge_after TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_imported_file_cache_purge_after
    ON app.imported_file_cache (purge_after)
    WHERE purge_after IS NOT NULL;
