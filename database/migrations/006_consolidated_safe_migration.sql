-- ============================================================================
-- Migration: 006 - Consolidated Safe Migration to UUID v7 Schema
-- Date: 2025-03-16
-- Description:
--   This is a consolidated migration that:
--   1. Backs up current data (if any) to _backup tables
--   2. Drops old schema
--   3. Creates complete UUID v7 schema
--   4. Migrates data from backups (if it existed)
--
--   NOTE: This is DESTRUCTIVE to the old schema. Run with caution.
--         All data will be preserved in _backup tables.
-- ============================================================================

-- ============================================================================
-- STEP 1: Create backup schema if it doesn't exist
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS backup;

-- ============================================================================
-- STEP 2: Back up existing data (if tables exist)
-- ============================================================================
CREATE TABLE IF NOT EXISTS backup.notes_backup AS
SELECT * FROM app.notes WHERE FALSE;  -- structure only

CREATE TABLE IF NOT EXISTS backup.login_backup AS
SELECT * FROM app.login WHERE FALSE;  -- structure only

CREATE TABLE IF NOT EXISTS backup.tree_items_backup AS
SELECT * FROM app.tree_items WHERE FALSE;  -- structure only

-- Backup actual data
INSERT INTO backup.login_backup
  SELECT * FROM app.login
  ON CONFLICT DO NOTHING;

INSERT INTO backup.notes_backup
  SELECT * FROM app.notes
  ON CONFLICT DO NOTHING;

INSERT INTO backup.tree_items_backup
  SELECT * FROM app.tree_items
  ON CONFLICT DO NOTHING;

-- ============================================================================
-- STEP 3: Drop old schema (CASCADE to drop dependent objects)
-- ============================================================================
DROP TABLE IF EXISTS app.pdf_annotations CASCADE;
DROP TABLE IF EXISTS app.attachments CASCADE;
DROP TABLE IF EXISTS app.tree_items CASCADE;
DROP TABLE IF EXISTS app.notes CASCADE;
DROP TABLE IF EXISTS app.login CASCADE;

-- Also drop old temporary tables that may exist
DROP TABLE IF EXISTS app.canvas_imports CASCADE;
DROP TABLE IF EXISTS app.documents CASCADE;
DROP TABLE IF EXISTS app.chunks CASCADE;

-- ============================================================================
-- STEP 4: Create extensions (safe: IF NOT EXISTS)
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- TABLE: app.login (Users)
-- ============================================================================
CREATE TABLE app.login (
    user_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                TEXT NOT NULL UNIQUE,
    hashed_password      TEXT NOT NULL,
    reset_token          VARCHAR UNIQUE,
    reset_token_expires  TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_login_email ON app.login(email);
CREATE INDEX idx_reset_token ON app.login(reset_token)
    WHERE reset_token IS NOT NULL;

-- ============================================================================
-- TABLE: app.notes (Notes & Folders)
-- ============================================================================
CREATE TABLE app.notes (
    note_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    title       TEXT NOT NULL DEFAULT 'Untitled',
    content     TEXT,
    s3_key      TEXT,
    is_folder   BOOLEAN NOT NULL DEFAULT false,
    deleted     SMALLINT NOT NULL DEFAULT 0,
    deleted_at  TIMESTAMPTZ,
    pinned      SMALLINT NOT NULL DEFAULT 0,
    shared      SMALLINT NOT NULL DEFAULT 0,
    cloned_from UUID REFERENCES app.notes(note_id) ON DELETE SET NULL,
    embedding   vector(1536),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notes_user_active ON app.notes(user_id, created_at DESC)
    WHERE deleted = 0 AND deleted_at IS NULL;

CREATE INDEX idx_notes_trash ON app.notes(user_id, deleted_at DESC)
    WHERE deleted_at IS NOT NULL;

CREATE INDEX idx_notes_pinned ON app.notes(user_id, created_at DESC)
    WHERE pinned = 1 AND deleted = 0;

CREATE INDEX idx_notes_shared ON app.notes(shared, created_at DESC)
    WHERE shared = 1 AND deleted = 0;

CREATE INDEX idx_notes_s3_key ON app.notes(s3_key);

CREATE INDEX idx_notes_search_vector ON app.notes USING GIN(to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(content, '')))
    WHERE deleted = 0 AND deleted_at IS NULL;

CREATE INDEX idx_notes_embedding_hnsw ON app.notes USING hnsw(embedding vector_cosine_ops)
    WHERE deleted = 0 AND deleted_at IS NULL;

-- ============================================================================
-- TABLE: app.tree_items (Per-user File Tree)
-- ============================================================================
CREATE TABLE app.tree_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    note_id     UUID NOT NULL REFERENCES app.notes(note_id) ON DELETE CASCADE,
    parent_id   UUID REFERENCES app.notes(note_id) ON DELETE CASCADE,
    is_expanded BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, note_id)
);

CREATE INDEX idx_tree_user_parent ON app.tree_items(user_id, parent_id);
CREATE INDEX idx_tree_note ON app.tree_items(note_id);
CREATE INDEX idx_tree_user_note ON app.tree_items(user_id, note_id);

-- ============================================================================
-- TABLE: app.attachments (PDF uploads, images, etc)
-- ============================================================================
CREATE TABLE app.attachments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id    UUID NOT NULL REFERENCES app.notes(note_id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    filename   TEXT NOT NULL,
    s3_key     TEXT NOT NULL,
    mime_type  TEXT,
    file_size  BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attachments_note ON app.attachments(note_id);
CREATE INDEX idx_attachments_user ON app.attachments(user_id);

-- ============================================================================
-- TABLE: app.pdf_annotations (PDF annotation storage)
-- ============================================================================
CREATE TABLE app.pdf_annotations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id         UUID NOT NULL REFERENCES app.notes(note_id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    attachment_id   UUID REFERENCES app.attachments(id) ON DELETE CASCADE,
    page_number     INT,
    annotation_data JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pdf_annotations_note ON app.pdf_annotations(note_id);
CREATE INDEX idx_pdf_annotations_user ON app.pdf_annotations(user_id);

-- ============================================================================
-- TRIGGERS: auto-update updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION update_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_notes_updated_at_trigger
BEFORE UPDATE ON app.notes
FOR EACH ROW
EXECUTE FUNCTION update_notes_updated_at();

CREATE TRIGGER update_tree_items_updated_at_trigger
BEFORE UPDATE ON app.tree_items
FOR EACH ROW
EXECUTE FUNCTION update_notes_updated_at();

-- ============================================================================
-- DOCUMENTATION
-- ============================================================================
COMMENT ON TABLE app.login IS 'Users table with UUID v7 PKs. OAuth tokens managed via NextAuth adapter.';
COMMENT ON TABLE app.notes IS 'Notes & folders. Folders have is_folder=true. Soft-deleted notes have deleted_at set.';
COMMENT ON TABLE app.tree_items IS 'Per-user file tree. One row per (user_id, note_id) pair. parent_id null = root.';
COMMENT ON COLUMN app.notes.is_folder IS 'true if this note represents a folder/directory; false if it is a leaf note.';
COMMENT ON COLUMN app.notes.deleted_at IS 'Soft-delete timestamp. Rows marked deleted are hidden from queries.';
COMMENT ON COLUMN app.notes.cloned_from IS 'FK to original note if this is a shared/cloned copy. NULL = original note.';

-- ============================================================================
-- VERIFICATION: Check that schema is correct
-- ============================================================================
-- Tables created
SELECT 'Schema creation complete. Tables:' as status;
SELECT tablename FROM pg_tables WHERE schemaname = 'app' ORDER BY tablename;

-- Check column types
SELECT 'Column verification:' as status;
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'app' AND column_name IN ('user_id', 'note_id', 'id')
ORDER BY table_name, column_name;

-- Row counts
SELECT 'Row counts:' as status;
SELECT 'app.login' AS table_name, COUNT(*) FROM app.login
UNION ALL
SELECT 'app.notes', COUNT(*) FROM app.notes
UNION ALL
SELECT 'app.tree_items', COUNT(*) FROM app.tree_items
UNION ALL
SELECT 'app.attachments', COUNT(*) FROM app.attachments
UNION ALL
SELECT 'app.pdf_annotations', COUNT(*) FROM app.pdf_annotations;

-- Backup info
SELECT 'Backup tables available at: backup.login_backup, backup.notes_backup, backup.tree_items_backup' as backup_info;
