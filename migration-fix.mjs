#!/usr/bin/env node
import postgres from 'postgres';

const DB_URL = 'postgresql://oghma_app:oghmainthedb@oghma.c5uicousc1yo.eu-north-1.rds.amazonaws.com:5432/oghma?sslmode=require';

const MIGRATION_SQL = `
-- Drop existing tables (fresh rebuild)
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
-- TABLE: app.tree_items (Per-user File Tree) - KEY CHANGE: parent_id is UUID
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
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE app.login IS 'Users table with UUID v7 PKs.';
COMMENT ON TABLE app.notes IS 'Notes & folders. Folders have is_folder=true. Soft-deleted notes have deleted_at set.';
COMMENT ON TABLE app.tree_items IS 'Per-user file tree. parent_id UUID references note_id (root if null).';
COMMENT ON COLUMN app.notes.is_folder IS 'true if folder, false if note.';
`;

async function main() {
  console.log('\n════════════════════════════════════════════════════');
  console.log('  OghmaNotes Database Schema Fix');
  console.log('════════════════════════════════════════════════════\n');

  let sql;
  try {
    sql = postgres(DB_URL, {
      ssl: 'require',
      debug: false,
      max: 1,
    });

    await sql`SELECT 1`;
    console.log('✅ Connected to database');
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    process.exit(1);
  }

  console.log('\n⏳ Running migration...\n');

  try {
    await sql.unsafe(MIGRATION_SQL);

    console.log('\n✅ Migration completed successfully!\n');
    console.log('📋 Tables created:');
    console.log('   ✓ app.login        (users)');
    console.log('   ✓ app.notes        (notes & folders)');
    console.log('   ✓ app.tree_items   (file tree with UUID parent_id - FIXED!)');
    console.log('   ✓ app.attachments  (file uploads)');
    console.log('   ✓ app.pdf_annotations (PDF markups)\n');

    console.log('🔐 Key Changes:');
    console.log('   ✓ parent_id changed from INTEGER to UUID');
    console.log('   ✓ parent_id now references app.notes.note_id');
    console.log('   ✓ Folder nesting will now work correctly!\n');

    console.log('════════════════════════════════════════════════════');
    console.log('  ✅ Database ready! Try importing Canvas courses now');
    console.log('════════════════════════════════════════════════════\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed!');
    console.error('\nError:', error.message);

    if (error.detail) {
      console.error('Detail:', error.detail);
    }

    process.exit(1);
  } finally {
    try {
      await sql.end();
    } catch (e) {
      // ignore
    }
  }
}

main();
