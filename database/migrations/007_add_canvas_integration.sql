-- ============================================================================
-- Migration: 007 - Add Canvas LMS Integration Support
-- Date: 2025-03-18
-- Description:
--   Adds Canvas LMS integration tables and columns:
--   1. canvas_token, canvas_domain columns to app.login
--   2. app.canvas_imports table to track file imports from Canvas
--   3. extracted_text column to app.notes for RAG pipeline
-- ============================================================================

-- ============================================================================
-- STEP 1: Add Canvas credentials to app.login
-- ============================================================================
ALTER TABLE app.login
  ADD COLUMN IF NOT EXISTS canvas_token TEXT,
  ADD COLUMN IF NOT EXISTS canvas_domain TEXT;

COMMENT ON COLUMN app.login.canvas_token IS 'Canvas API token (user-generated). NULL if Canvas not connected.';
COMMENT ON COLUMN app.login.canvas_domain IS 'Canvas institution domain e.g. dcu.instructure.com. NULL if Canvas not connected.';

-- ============================================================================
-- STEP 2: Add extracted_text to app.notes for RAG pipeline
-- ============================================================================
ALTER TABLE app.notes
  ADD COLUMN IF NOT EXISTS extracted_text TEXT;

COMMENT ON COLUMN app.notes.extracted_text IS 'Cleaned text extracted from PDFs via pdf-parse. Used for RAG chunking and search.';

-- ============================================================================
-- TABLE: app.canvas_imports
-- ============================================================================
-- Tracks the status of files imported from Canvas LMS.
-- Each row represents one file being imported from a Canvas module.
-- Status flow: downloading → processing → complete (or forbidden/error)
CREATE TABLE IF NOT EXISTS app.canvas_imports (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
    canvas_course_id    INT NOT NULL,
    canvas_module_id    INT NOT NULL,
    canvas_file_id      INT NOT NULL,
    note_id             UUID REFERENCES app.notes(note_id) ON DELETE SET NULL,
    filename            TEXT NOT NULL,
    mime_type           TEXT,
    status              TEXT NOT NULL DEFAULT 'downloading',
      -- downloading: file is being downloaded from Canvas
      -- processing: file is being processed (pdf-parse, embedding, etc.)
      -- complete: file successfully imported
      -- forbidden: file access denied by lecturer
      -- error: processing or download failed
    error_message       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canvas_imports_user ON app.canvas_imports(user_id);
CREATE INDEX IF NOT EXISTS idx_canvas_imports_status ON app.canvas_imports(user_id, status)
    WHERE status != 'complete';
CREATE INDEX IF NOT EXISTS idx_canvas_imports_note ON app.canvas_imports(note_id)
    WHERE note_id IS NOT NULL;

-- ============================================================================
-- TRIGGER: auto-update canvas_imports.updated_at
-- ============================================================================
CREATE TRIGGER IF NOT EXISTS update_canvas_imports_updated_at_trigger
BEFORE UPDATE ON app.canvas_imports
FOR EACH ROW
EXECUTE FUNCTION update_notes_updated_at();

COMMENT ON TABLE app.canvas_imports IS 'Tracks Canvas file import progress. One row per file being imported.';
COMMENT ON COLUMN app.canvas_imports.status IS 'Import status: downloading, processing, complete, forbidden, or error.';

-- ============================================================================
-- VERIFICATION
-- ============================================================================
SELECT 'Canvas integration migration complete' as status;
SELECT 'New columns added to app.login:' as note;
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'app' AND table_name = 'login' AND column_name LIKE 'canvas%'
ORDER BY column_name;

SELECT 'New columns added to app.notes:' as note;
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'app' AND table_name = 'notes' AND column_name = 'extracted_text';

SELECT 'Canvas tables created:' as note;
SELECT tablename FROM pg_tables WHERE schemaname = 'app' AND tablename LIKE 'canvas%'
ORDER BY tablename;
