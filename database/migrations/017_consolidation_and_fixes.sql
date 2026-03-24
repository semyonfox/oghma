-- ============================================================================
-- Migration: 017 — Consolidation, Fixes, and Cleanup
-- Date: 2026-03-24
--
-- brings the database to the definitive latest state:
--   1. drops the unused sam schema
--   2. ensures all tables/columns from 007-016 exist (idempotent)
--   3. fixes embedding dimensions to Cohere vector(1024)
--   4. adds missing FK on chunks.document_id -> notes.note_id CASCADE
--   5. removes redundant index idx_tree_user_note
--   6. deduplicates canvas folders and imports
--   7. hard-deletes soft-deleted notes and deactivated accounts
--   8. creates schema_migrations tracking table
--
-- fully idempotent — safe to run multiple times
-- run with: node scripts/run-migration.mjs
-- or:       psql "$DATABASE_URL" -f database/migrations/017_consolidation_and_fixes.sql
--           (wrap in BEGIN/COMMIT if running via psql)
-- ============================================================================

-- ============================================================================
-- 1. PREREQUISITES
-- ============================================================================
-- extensions are already installed on RDS (uuid-ossp, vector, pg_trgm)
-- CREATE EXTENSION requires rds_superuser, so skip if permission denied
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
DO $$ BEGIN
  CREATE SCHEMA IF NOT EXISTS app;
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;

-- drop unused schemas (may fail if owned by a different user)
DO $$ BEGIN
  DROP SCHEMA IF EXISTS sam CASCADE;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'skipped dropping sam schema — not owner';
END $$;

-- ============================================================================
-- 2. MIGRATION TRACKING TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS app.schema_migrations (
    version    TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 3. ENSURE ALL TABLES EXIST (idempotent creates)
-- ============================================================================

-- canvas_imports (from 007)
CREATE TABLE IF NOT EXISTS app.canvas_imports (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    canvas_course_id INT NOT NULL,
    canvas_module_id INT NOT NULL,
    canvas_file_id   INT NOT NULL,
    note_id          UUID REFERENCES app.notes(note_id) ON DELETE SET NULL,
    filename         TEXT NOT NULL,
    mime_type        TEXT,
    status           TEXT NOT NULL DEFAULT 'downloading',
    error_message    TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- canvas_import_jobs (from 008)
CREATE TABLE IF NOT EXISTS app.canvas_import_jobs (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    course_ids     JSONB NOT NULL,
    status         TEXT NOT NULL DEFAULT 'queued',
    error_message  TEXT,
    started_at     TIMESTAMPTZ,
    completed_at   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- chunks (from 012)
CREATE TABLE IF NOT EXISTS app.chunks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL,
    user_id     UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    text        TEXT NOT NULL,
    page_number INT,
    section     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- embeddings (from 012, target dimension: 1024)
CREATE TABLE IF NOT EXISTS app.embeddings (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chunk_id  UUID NOT NULL REFERENCES app.chunks(id) ON DELETE CASCADE,
    embedding vector(1024) NOT NULL
);

-- oauth_accounts (from 015)
CREATE TABLE IF NOT EXISTS app.oauth_accounts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    provider     TEXT NOT NULL,
    provider_id  TEXT NOT NULL,
    email        TEXT,
    name         TEXT,
    avatar_url   TEXT,
    locale       TEXT,
    raw_profile  JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider, provider_id)
);

-- ============================================================================
-- 4. ENSURE ALL COLUMNS EXIST (idempotent alters)
-- ============================================================================

-- login columns (007, 014, 015)
ALTER TABLE app.login ADD COLUMN IF NOT EXISTS canvas_token TEXT;
ALTER TABLE app.login ADD COLUMN IF NOT EXISTS canvas_domain TEXT;
ALTER TABLE app.login ADD COLUMN IF NOT EXISTS canvas_auto_sync BOOLEAN DEFAULT false;
ALTER TABLE app.login ADD COLUMN IF NOT EXISTS canvas_last_sync_at TIMESTAMPTZ;
ALTER TABLE app.login ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE app.login ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE app.login ADD COLUMN IF NOT EXISTS locale TEXT;

-- is_active (010) and deleted_at (011) — need DO block for NOT NULL constraint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'login' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE app.login ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'login' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE app.login ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;
END $$;

-- notes columns (007, 014)
ALTER TABLE app.notes ADD COLUMN IF NOT EXISTS extracted_text TEXT;
ALTER TABLE app.notes ADD COLUMN IF NOT EXISTS canvas_course_id INT;
ALTER TABLE app.notes ADD COLUMN IF NOT EXISTS canvas_module_id INT;
ALTER TABLE app.notes ADD COLUMN IF NOT EXISTS canvas_assignment_id INT;
ALTER TABLE app.notes ADD COLUMN IF NOT EXISTS canvas_academic_year TEXT;

-- drop legacy notes.embedding column (016 — replaced by chunks/embeddings tables)
ALTER TABLE app.notes DROP COLUMN IF EXISTS embedding;

-- canvas_imports.job_id FK (014)
ALTER TABLE app.canvas_imports ADD COLUMN IF NOT EXISTS job_id UUID;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_type = 'FOREIGN KEY'
      AND table_schema = 'app' AND table_name = 'canvas_imports'
      AND constraint_name = 'canvas_imports_job_id_fkey'
  ) THEN
    ALTER TABLE app.canvas_imports
      ADD CONSTRAINT canvas_imports_job_id_fkey
      FOREIGN KEY (job_id) REFERENCES app.canvas_import_jobs(id) ON DELETE SET NULL;
  END IF;
END $$;

-- canvas_import_jobs columns (014)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'canvas_import_jobs' AND column_name = 'job_type'
  ) THEN
    ALTER TABLE app.canvas_import_jobs ADD COLUMN job_type TEXT NOT NULL DEFAULT 'import';
  END IF;
END $$;
ALTER TABLE app.canvas_import_jobs ADD COLUMN IF NOT EXISTS expected_total INT;

-- ============================================================================
-- 5. FIX EMBEDDING DIMENSIONS (target: Cohere embed-english-v3.0 = 1024)
-- ============================================================================
DO $$
DECLARE
  cur_type TEXT;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod) INTO cur_type
  FROM pg_attribute a
  JOIN pg_class c ON a.attrelid = c.oid
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = 'app' AND c.relname = 'embeddings' AND a.attname = 'embedding'
    AND a.attnum > 0 AND NOT a.attisdropped;

  IF cur_type IS NOT NULL AND cur_type != 'vector(1024)' THEN
    RAISE NOTICE 'resizing embeddings from % to vector(1024) — truncating incompatible data', cur_type;
    TRUNCATE app.embeddings CASCADE;
    TRUNCATE app.chunks CASCADE;
    ALTER TABLE app.embeddings ALTER COLUMN embedding TYPE vector(1024);
  END IF;
END $$;

-- ============================================================================
-- 6. INDEXES — create missing, drop redundant
-- ============================================================================

-- login
CREATE INDEX IF NOT EXISTS idx_login_email ON app.login(email);
CREATE INDEX IF NOT EXISTS idx_reset_token ON app.login(reset_token) WHERE reset_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_login_active ON app.login(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_login_deleted_at ON app.login(deleted_at) WHERE deleted_at IS NULL;

-- notes
CREATE INDEX IF NOT EXISTS idx_notes_user_active ON app.notes(user_id, created_at DESC)
    WHERE deleted = 0 AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notes_trash ON app.notes(user_id, deleted_at DESC)
    WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notes_pinned ON app.notes(user_id, created_at DESC)
    WHERE pinned = 1 AND deleted = 0;
CREATE INDEX IF NOT EXISTS idx_notes_shared ON app.notes(shared, created_at DESC)
    WHERE shared = 1 AND deleted = 0;
CREATE INDEX IF NOT EXISTS idx_notes_s3_key ON app.notes(s3_key);
CREATE INDEX IF NOT EXISTS idx_notes_search_vector ON app.notes
    USING GIN(to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(content, '')))
    WHERE deleted = 0 AND deleted_at IS NULL;

-- tree_items — drop redundant index (UNIQUE(user_id, note_id) constraint covers it)
DROP INDEX IF EXISTS app.idx_tree_user_note;
CREATE INDEX IF NOT EXISTS idx_tree_user_parent ON app.tree_items(user_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_tree_note ON app.tree_items(note_id);

-- attachments
CREATE INDEX IF NOT EXISTS idx_attachments_note ON app.attachments(note_id);
CREATE INDEX IF NOT EXISTS idx_attachments_user ON app.attachments(user_id);

-- pdf_annotations
CREATE INDEX IF NOT EXISTS idx_pdf_annotations_note ON app.pdf_annotations(note_id);
CREATE INDEX IF NOT EXISTS idx_pdf_annotations_user ON app.pdf_annotations(user_id);

-- canvas_imports
CREATE INDEX IF NOT EXISTS idx_canvas_imports_user ON app.canvas_imports(user_id);
CREATE INDEX IF NOT EXISTS idx_canvas_imports_status ON app.canvas_imports(user_id, status)
    WHERE status != 'complete';
CREATE INDEX IF NOT EXISTS idx_canvas_imports_note ON app.canvas_imports(note_id)
    WHERE note_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS canvas_imports_dedup_idx ON app.canvas_imports(user_id, canvas_file_id)
    WHERE status = 'complete';
CREATE INDEX IF NOT EXISTS idx_canvas_imports_job ON app.canvas_imports(job_id)
    WHERE job_id IS NOT NULL;

-- canvas_import_jobs
CREATE INDEX IF NOT EXISTS idx_canvas_import_jobs_user ON app.canvas_import_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_canvas_import_jobs_status ON app.canvas_import_jobs(status)
    WHERE status != 'complete';
CREATE INDEX IF NOT EXISTS idx_canvas_import_jobs_queue ON app.canvas_import_jobs(created_at)
    WHERE status = 'queued';

-- canvas folder dedup unique indexes (014)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_canvas_course_folder
  ON app.notes(user_id, canvas_course_id)
  WHERE is_folder = true AND canvas_module_id IS NULL
    AND canvas_assignment_id IS NULL AND canvas_course_id IS NOT NULL AND deleted = 0;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_canvas_module_folder
  ON app.notes(user_id, canvas_course_id, canvas_module_id)
  WHERE is_folder = true AND canvas_module_id IS NOT NULL AND deleted = 0;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_canvas_assignment_folder
  ON app.notes(user_id, canvas_course_id, canvas_assignment_id)
  WHERE is_folder = true AND canvas_assignment_id IS NOT NULL AND deleted = 0;

-- chunks & embeddings
CREATE INDEX IF NOT EXISTS idx_chunks_user ON app.chunks(user_id);
CREATE INDEX IF NOT EXISTS idx_chunks_document ON app.chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_chunk ON app.embeddings(chunk_id);
-- drop legacy HNSW index that was on the now-dropped notes.embedding column
DROP INDEX IF EXISTS app.idx_notes_embedding_hnsw;
-- HNSW for cosine similarity on Cohere 1024-dim vectors (within 2000-dim limit)
CREATE INDEX IF NOT EXISTS idx_embeddings_hnsw
    ON app.embeddings USING hnsw(embedding vector_cosine_ops);

-- oauth_accounts
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id ON app.oauth_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider_email ON app.oauth_accounts(provider, email);

-- ============================================================================
-- 7. TRIGGERS (drop + create pattern for PG <14 compat)
-- ============================================================================

-- shared updated_at function
CREATE OR REPLACE FUNCTION update_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_notes_updated_at_trigger ON app.notes;
CREATE TRIGGER update_notes_updated_at_trigger
    BEFORE UPDATE ON app.notes FOR EACH ROW
    EXECUTE FUNCTION update_notes_updated_at();

DROP TRIGGER IF EXISTS update_tree_items_updated_at_trigger ON app.tree_items;
CREATE TRIGGER update_tree_items_updated_at_trigger
    BEFORE UPDATE ON app.tree_items FOR EACH ROW
    EXECUTE FUNCTION update_notes_updated_at();

DROP TRIGGER IF EXISTS update_canvas_imports_updated_at_trigger ON app.canvas_imports;
CREATE TRIGGER update_canvas_imports_updated_at_trigger
    BEFORE UPDATE ON app.canvas_imports FOR EACH ROW
    EXECUTE FUNCTION update_notes_updated_at();

-- canvas_import_jobs has its own function
CREATE OR REPLACE FUNCTION update_canvas_import_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_canvas_import_jobs_updated_at_trigger ON app.canvas_import_jobs;
CREATE TRIGGER update_canvas_import_jobs_updated_at_trigger
    BEFORE UPDATE ON app.canvas_import_jobs FOR EACH ROW
    EXECUTE FUNCTION update_canvas_import_jobs_updated_at();

-- oauth_accounts
CREATE OR REPLACE FUNCTION app.update_oauth_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_oauth_accounts_updated_at ON app.oauth_accounts;
CREATE TRIGGER trg_oauth_accounts_updated_at
    BEFORE UPDATE ON app.oauth_accounts FOR EACH ROW
    EXECUTE FUNCTION app.update_oauth_updated_at();

-- ============================================================================
-- 8. FIX CHUNKS FK — document_id -> notes.note_id ON DELETE CASCADE
--    (issue #105: was missing, causing orphaned chunks on note deletion)
-- ============================================================================
DO $$
DECLARE
  orphan_embeddings INT;
  orphan_chunks INT;
BEGIN
  -- clean orphaned embeddings (chunk no longer exists)
  DELETE FROM app.embeddings
  WHERE chunk_id NOT IN (SELECT id FROM app.chunks);
  GET DIAGNOSTICS orphan_embeddings = ROW_COUNT;

  -- clean orphaned chunks (document/note no longer exists)
  DELETE FROM app.chunks
  WHERE document_id NOT IN (SELECT note_id FROM app.notes);
  GET DIAGNOSTICS orphan_chunks = ROW_COUNT;

  IF orphan_embeddings > 0 OR orphan_chunks > 0 THEN
    RAISE NOTICE 'cleaned % orphaned embeddings, % orphaned chunks', orphan_embeddings, orphan_chunks;
  END IF;

  -- add FK if it doesn't already exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_type = 'FOREIGN KEY'
      AND table_schema = 'app' AND table_name = 'chunks'
      AND constraint_name = 'fk_chunks_document_note'
  ) THEN
    ALTER TABLE app.chunks
      ADD CONSTRAINT fk_chunks_document_note
      FOREIGN KEY (document_id) REFERENCES app.notes(note_id) ON DELETE CASCADE;
    RAISE NOTICE 'added FK: chunks.document_id -> notes.note_id ON DELETE CASCADE';
  END IF;
END $$;

-- ============================================================================
-- 9. DEDUPLICATE DATA
-- ============================================================================

-- 9a. canvas folder dedup (re-run of 014 logic for any new duplicates)
DO $$
DECLARE
  grp RECORD;
  winner_id UUID;
  loser RECORD;
  merge_count INT := 0;
BEGIN
  -- deduplicate root-level course folders (same user + title at root)
  FOR grp IN
    SELECT n.user_id, n.title, COUNT(*) AS cnt
    FROM app.notes n
    JOIN app.tree_items t ON t.user_id = n.user_id AND t.note_id = n.note_id
    WHERE n.is_folder = true AND n.deleted = 0 AND t.parent_id IS NULL
      AND (n.title LIKE '%—%' OR n.title LIKE '%-%')
    GROUP BY n.user_id, n.title HAVING COUNT(*) > 1
  LOOP
    SELECT n.note_id INTO winner_id
    FROM app.notes n
    WHERE n.user_id = grp.user_id AND n.title = grp.title
      AND n.is_folder = true AND n.deleted = 0
    ORDER BY n.created_at ASC LIMIT 1;

    FOR loser IN
      SELECT n.note_id FROM app.notes n
      WHERE n.user_id = grp.user_id AND n.title = grp.title
        AND n.is_folder = true AND n.deleted = 0 AND n.note_id != winner_id
    LOOP
      UPDATE app.tree_items SET parent_id = winner_id
      WHERE parent_id = loser.note_id AND user_id = grp.user_id;
      UPDATE app.notes SET deleted = 1, deleted_at = NOW()
      WHERE note_id = loser.note_id;
      merge_count := merge_count + 1;
    END LOOP;
  END LOOP;

  -- deduplicate module subfolders (same title under same parent)
  FOR grp IN
    SELECT t.user_id, t.parent_id, n.title, COUNT(*) AS cnt
    FROM app.notes n
    JOIN app.tree_items t ON t.user_id = n.user_id AND t.note_id = n.note_id
    WHERE n.is_folder = true AND n.deleted = 0 AND t.parent_id IS NOT NULL
    GROUP BY t.user_id, t.parent_id, n.title HAVING COUNT(*) > 1
  LOOP
    SELECT n.note_id INTO winner_id
    FROM app.notes n
    JOIN app.tree_items t ON t.user_id = n.user_id AND t.note_id = n.note_id
    WHERE n.user_id = grp.user_id AND t.parent_id = grp.parent_id
      AND n.title = grp.title AND n.is_folder = true AND n.deleted = 0
    ORDER BY n.created_at ASC LIMIT 1;

    FOR loser IN
      SELECT n.note_id FROM app.notes n
      JOIN app.tree_items t ON t.user_id = n.user_id AND t.note_id = n.note_id
      WHERE n.user_id = grp.user_id AND t.parent_id = grp.parent_id
        AND n.title = grp.title AND n.is_folder = true AND n.deleted = 0
        AND n.note_id != winner_id
    LOOP
      UPDATE app.tree_items SET parent_id = winner_id
      WHERE parent_id = loser.note_id AND user_id = grp.user_id;
      UPDATE app.notes SET deleted = 1, deleted_at = NOW()
      WHERE note_id = loser.note_id;
      merge_count := merge_count + 1;
    END LOOP;
  END LOOP;

  IF merge_count > 0 THEN
    RAISE NOTICE 'merged % duplicate canvas folders', merge_count;
  END IF;
END $$;

-- 9b. backfill canvas_course_id on surviving course folders
UPDATE app.notes n
SET canvas_course_id = sub.course_id
FROM (
  SELECT DISTINCT ON (t.parent_id)
    t.parent_id AS folder_note_id,
    ci.canvas_course_id AS course_id
  FROM app.canvas_imports ci
  JOIN app.tree_items t ON t.note_id = ci.note_id AND t.user_id = ci.user_id
  WHERE ci.status = 'complete' AND ci.note_id IS NOT NULL AND t.parent_id IS NOT NULL
  ORDER BY t.parent_id, ci.created_at DESC
) sub
WHERE n.note_id = sub.folder_note_id
  AND n.is_folder = true AND n.canvas_course_id IS NULL;

-- propagate canvas_course_id up to parent course folders
UPDATE app.notes n
SET canvas_course_id = child.canvas_course_id
FROM (
  SELECT DISTINCT ON (t.parent_id) t.parent_id, n2.canvas_course_id
  FROM app.notes n2
  JOIN app.tree_items t ON t.note_id = n2.note_id AND t.user_id = n2.user_id
  WHERE n2.canvas_course_id IS NOT NULL AND n2.is_folder = true AND t.parent_id IS NOT NULL
  ORDER BY t.parent_id
) child
WHERE n.note_id = child.parent_id
  AND n.is_folder = true AND n.canvas_course_id IS NULL;

-- 9c. deduplicate canvas_imports (keep latest complete import per user+file)
DELETE FROM app.canvas_imports a
USING app.canvas_imports b
WHERE a.user_id = b.user_id
  AND a.canvas_file_id = b.canvas_file_id
  AND a.status = 'complete' AND b.status = 'complete'
  AND a.id != b.id AND a.created_at < b.created_at;

-- ============================================================================
-- 10. HARD-DELETE SOFT-DELETED RECORDS
-- ============================================================================

-- re-parent non-deleted children of soft-deleted folders to root first,
-- so cascade doesn't orphan their tree positions
UPDATE app.tree_items t
SET parent_id = NULL
WHERE t.parent_id IN (SELECT note_id FROM app.notes WHERE deleted = 1 AND is_folder = true)
  AND t.note_id NOT IN (SELECT note_id FROM app.notes WHERE deleted = 1);

DO $$
DECLARE
  deleted_notes INT;
  deleted_accounts INT;
BEGIN
  -- hard-delete all soft-deleted notes
  -- cascades: tree_items, attachments, pdf_annotations, chunks->embeddings (via FKs)
  DELETE FROM app.notes WHERE deleted = 1;
  GET DIAGNOSTICS deleted_notes = ROW_COUNT;

  -- hard-delete deactivated accounts (user requested deletion)
  -- cascades: all user data across every table
  DELETE FROM app.login WHERE is_active = false AND deleted_at IS NOT NULL;
  GET DIAGNOSTICS deleted_accounts = ROW_COUNT;

  IF deleted_notes > 0 OR deleted_accounts > 0 THEN
    RAISE NOTICE 'hard-deleted % notes, % deactivated accounts', deleted_notes, deleted_accounts;
  END IF;
END $$;

-- note: S3 objects (notes.s3_key, attachments.s3_key) for deleted records
-- are now orphaned in the bucket and should be cleaned up separately

-- ============================================================================
-- 11. RECORD ALL MIGRATIONS
-- ============================================================================
INSERT INTO app.schema_migrations (version, name) VALUES
  ('006', 'consolidated_safe_migration'),
  ('007', 'add_canvas_integration'),
  ('008', 'canvas_import_jobs_queue'),
  ('009', 'canvas_dedup_index'),
  ('010', 'add_is_active_to_login'),
  ('011', 'add_deleted_at_to_login'),
  ('012', 'rag_chunks_embeddings'),
  ('013', 'fix_notes_embedding_dim'),
  ('014', 'canvas_overhaul'),
  ('015', 'oauth_accounts'),
  ('016', 'cohere_embeddings_reset'),
  ('017', 'consolidation_and_fixes')
ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- 12. TABLE COMMENTS
-- ============================================================================
COMMENT ON TABLE app.schema_migrations IS 'Migration version tracking.';
COMMENT ON TABLE app.login IS 'Users. UUID PKs. OAuth via oauth_accounts table.';
COMMENT ON TABLE app.notes IS 'Notes and folders. is_folder=true for folders.';
COMMENT ON TABLE app.tree_items IS 'Per-user file tree. parent_id null = root level.';
COMMENT ON TABLE app.canvas_imports IS 'Canvas LMS file import tracking.';
COMMENT ON TABLE app.canvas_import_jobs IS 'Async job queue for Canvas import/sync batches.';
COMMENT ON TABLE app.chunks IS 'RAG: text chunks from documents. FK to notes via document_id.';
COMMENT ON TABLE app.embeddings IS 'RAG: Cohere embed-english-v3.0 vector(1024) per chunk.';
COMMENT ON TABLE app.oauth_accounts IS 'OAuth provider identities linked to login users.';

-- maintenance
ANALYZE app.notes;
ANALYZE app.login;
ANALYZE app.tree_items;
ANALYZE app.chunks;
ANALYZE app.embeddings;
ANALYZE app.canvas_imports;
