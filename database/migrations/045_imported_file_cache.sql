-- 045_imported_file_cache.sql
-- Canonical cache for imported PDFs so duplicate Canvas files can reuse the
-- stored blob and previously extracted/indexed markdown across users.

CREATE TABLE IF NOT EXISTS app.imported_file_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sha256 TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    storage_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'processing',
    replayable BOOLEAN NOT NULL DEFAULT FALSE,
    extracted_markdown TEXT,
    extracted_text TEXT,
    extraction_coverage JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_imported_file_cache_status
    ON app.imported_file_cache(status);

CREATE TABLE IF NOT EXISTS app.imported_file_cache_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cache_id UUID NOT NULL REFERENCES app.imported_file_cache(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_imported_file_cache_chunks_cache_id
    ON app.imported_file_cache_chunks(cache_id);

ALTER TABLE app.notes
    ADD COLUMN IF NOT EXISTS imported_file_cache_id UUID REFERENCES app.imported_file_cache(id);

ALTER TABLE app.canvas_imports
    ADD COLUMN IF NOT EXISTS imported_file_cache_id UUID REFERENCES app.imported_file_cache(id);
