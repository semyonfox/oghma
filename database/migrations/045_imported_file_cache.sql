-- Content-addressed, pipeline-versioned cache for imported PDFs.
-- Binary and derived artifacts are shared; notes, attachments, annotations,
-- Canvas provenance and searchable Qdrant points remain user scoped.

CREATE TABLE IF NOT EXISTS app.imported_file_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sha256 TEXT NOT NULL,
    pipeline_version TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size BIGINT NOT NULL CHECK (file_size >= 0),
    storage_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing'
        CHECK (status IN ('processing', 'ready', 'failed')),
    replayable BOOLEAN NOT NULL DEFAULT FALSE,
    extracted_markdown TEXT,
    extracted_text TEXT,
    extraction_coverage JSONB,
    error_message TEXT,
    processing_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (sha256, pipeline_version),
    UNIQUE (storage_key, pipeline_version)
);

CREATE INDEX IF NOT EXISTS idx_imported_file_cache_status
    ON app.imported_file_cache(status, updated_at);

CREATE TABLE IF NOT EXISTS app.imported_file_cache_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cache_id UUID NOT NULL REFERENCES app.imported_file_cache(id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (cache_id, ordinal)
);

CREATE TABLE IF NOT EXISTS app.imported_file_cache_assets (
    cache_id UUID NOT NULL REFERENCES app.imported_file_cache(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    storage_key TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (cache_id, name)
);

-- A verified Canvas record may point to a content-addressed artifact. This is
-- only a download-skipping locator: SHA-256 remains the authoritative identity.
CREATE TABLE IF NOT EXISTS app.imported_file_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cache_id UUID NOT NULL REFERENCES app.imported_file_cache(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider = 'canvas'),
    tenant TEXT NOT NULL,
    external_file_id TEXT NOT NULL,
    version_token TEXT NOT NULL,
    file_size BIGINT NOT NULL CHECK (file_size >= 0),
    mime_type TEXT NOT NULL,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider, tenant, external_file_id, version_token, file_size, mime_type)
);

CREATE INDEX IF NOT EXISTS idx_imported_file_sources_cache
    ON app.imported_file_sources(cache_id);

ALTER TABLE app.notes
    ADD COLUMN IF NOT EXISTS imported_file_cache_id UUID
        REFERENCES app.imported_file_cache(id) ON DELETE SET NULL;

ALTER TABLE app.canvas_imports
    ADD COLUMN IF NOT EXISTS imported_file_cache_id UUID
        REFERENCES app.imported_file_cache(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notes_imported_file_cache
    ON app.notes(imported_file_cache_id)
    WHERE imported_file_cache_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_canvas_imports_imported_file_cache
    ON app.canvas_imports(imported_file_cache_id)
    WHERE imported_file_cache_id IS NOT NULL;

-- Import redelivery and retries must not create duplicate attachment pointers.
DELETE FROM app.attachments duplicate
USING app.attachments keeper
WHERE duplicate.note_id = keeper.note_id
  AND duplicate.s3_key = keeper.s3_key
  AND (duplicate.created_at, duplicate.id) > (keeper.created_at, keeper.id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_attachments_note_s3_key
    ON app.attachments(note_id, s3_key);
