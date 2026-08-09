-- A cache revision is derived by a system-owned, non-tree source note.  This
-- keeps Marker output out of an editable user projection while preserving the
-- existing note/asset/chunk pipeline and its ownership constraints.
ALTER TABLE app.notes
    ADD COLUMN IF NOT EXISTS is_import_cache_source BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_notes_import_cache_source
    ON app.notes (user_id, imported_file_cache_id)
    WHERE is_import_cache_source = TRUE;

ALTER TABLE app.marker_jobs
    ADD COLUMN IF NOT EXISTS imported_file_cache_id UUID
        REFERENCES app.imported_file_cache(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_marker_jobs_imported_file_cache
    ON app.marker_jobs (imported_file_cache_id, status, created_at)
    WHERE imported_file_cache_id IS NOT NULL;

-- An editable note may lag behind an immutable cache revision.  This is an
-- audit/backfill record, not permission to overwrite the user's note.
CREATE TABLE IF NOT EXISTS app.imported_file_cache_note_updates (
    note_id UUID PRIMARY KEY REFERENCES app.notes(note_id) ON DELETE CASCADE,
    base_cache_id UUID NOT NULL REFERENCES app.imported_file_cache(id) ON DELETE CASCADE,
    available_cache_id UUID NOT NULL REFERENCES app.imported_file_cache(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'available'
        CHECK (status IN ('available', 'applied', 'dismissed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (base_cache_id <> available_cache_id)
);

CREATE INDEX IF NOT EXISTS idx_imported_file_cache_note_updates_available
    ON app.imported_file_cache_note_updates (available_cache_id, status)
    WHERE status = 'available';
