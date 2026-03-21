-- ============================================================================
-- Migration: 014 - Canvas Integration Overhaul
-- Date: 2026-03-21
-- Description:
--   Fixes folder triplication, progress counting, naming, and import/sync
--   separation. Adds:
--   1. Canvas metadata columns on app.notes for folder deduplication
--   2. Unique partial indexes to prevent duplicate Canvas folders
--   3. job_type + expected_total on canvas_import_jobs
--   4. job_id FK on canvas_imports for accurate progress tracking
--   5. Auto-sync preferences on app.login
--   6. Automatic cleanup of existing duplicate folders
-- ============================================================================

-- ============================================================================
-- STEP 1: Canvas metadata on app.notes for folder deduplication
-- ============================================================================
ALTER TABLE app.notes
  ADD COLUMN IF NOT EXISTS canvas_course_id INT,
  ADD COLUMN IF NOT EXISTS canvas_module_id INT,
  ADD COLUMN IF NOT EXISTS canvas_assignment_id INT,
  ADD COLUMN IF NOT EXISTS canvas_academic_year TEXT;

COMMENT ON COLUMN app.notes.canvas_course_id IS 'Canvas course ID for imported folders. Used for deduplication.';
COMMENT ON COLUMN app.notes.canvas_module_id IS 'Canvas module ID for imported module folders. NULL for course-level folders.';
COMMENT ON COLUMN app.notes.canvas_assignment_id IS 'Canvas assignment ID for assignment folders.';
COMMENT ON COLUMN app.notes.canvas_academic_year IS 'Academic year extracted from course_code (e.g. "2425").';

-- one course folder per user
CREATE UNIQUE INDEX IF NOT EXISTS uniq_canvas_course_folder
  ON app.notes (user_id, canvas_course_id)
  WHERE is_folder = true
    AND canvas_module_id IS NULL
    AND canvas_assignment_id IS NULL
    AND canvas_course_id IS NOT NULL
    AND deleted = 0;

-- one module folder per course per user
CREATE UNIQUE INDEX IF NOT EXISTS uniq_canvas_module_folder
  ON app.notes (user_id, canvas_course_id, canvas_module_id)
  WHERE is_folder = true
    AND canvas_module_id IS NOT NULL
    AND deleted = 0;

-- one assignment folder per course per user
CREATE UNIQUE INDEX IF NOT EXISTS uniq_canvas_assignment_folder
  ON app.notes (user_id, canvas_course_id, canvas_assignment_id)
  WHERE is_folder = true
    AND canvas_assignment_id IS NOT NULL
    AND deleted = 0;

-- ============================================================================
-- STEP 2: Job metadata for progress tracking + import/sync distinction
-- ============================================================================
ALTER TABLE app.canvas_import_jobs
  ADD COLUMN IF NOT EXISTS job_type TEXT NOT NULL DEFAULT 'import',
  ADD COLUMN IF NOT EXISTS expected_total INT;

COMMENT ON COLUMN app.canvas_import_jobs.job_type IS 'Job type: import (bulk) or sync (incremental).';
COMMENT ON COLUMN app.canvas_import_jobs.expected_total IS 'Pre-counted file total for accurate progress display.';

-- ============================================================================
-- STEP 3: Link canvas_imports records to their parent job
-- ============================================================================
ALTER TABLE app.canvas_imports
  ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES app.canvas_import_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_canvas_imports_job
  ON app.canvas_imports(job_id)
  WHERE job_id IS NOT NULL;

-- ============================================================================
-- STEP 4: Auto-sync preferences on app.login
-- ============================================================================
ALTER TABLE app.login
  ADD COLUMN IF NOT EXISTS canvas_auto_sync BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS canvas_last_sync_at TIMESTAMPTZ;

COMMENT ON COLUMN app.login.canvas_auto_sync IS 'Whether to auto-check for new Canvas files on login / 6h interval.';
COMMENT ON COLUMN app.login.canvas_last_sync_at IS 'Timestamp of the last completed sync. Used for new-content detection.';

-- ============================================================================
-- STEP 5: Clean up existing duplicate Canvas folders
--
-- Finds duplicate course folders (same user_id + title pattern), keeps the
-- oldest, re-parents children of duplicates into the survivor, soft-deletes
-- the empty duplicates, and backfills canvas_course_id on survivors.
-- ============================================================================
DO $$
DECLARE
  grp RECORD;
  winner_id UUID;
  loser RECORD;
BEGIN
  -- find groups of duplicate folders created by Canvas import
  -- a Canvas-imported course folder sits at root (parent_id IS NULL in tree_items)
  -- and typically contains " — " or " - " in the title
  FOR grp IN
    SELECT n.user_id, n.title, COUNT(*) AS cnt,
           MIN(n.created_at) AS earliest
    FROM app.notes n
    JOIN app.tree_items t ON t.user_id = n.user_id AND t.note_id = n.note_id
    WHERE n.is_folder = true
      AND n.deleted = 0
      AND t.parent_id IS NULL
      AND (n.title LIKE '%—%' OR n.title LIKE '%-%')
    GROUP BY n.user_id, n.title
    HAVING COUNT(*) > 1
  LOOP
    -- pick the oldest folder as the winner
    SELECT n.note_id INTO winner_id
    FROM app.notes n
    WHERE n.user_id = grp.user_id
      AND n.title = grp.title
      AND n.is_folder = true
      AND n.deleted = 0
    ORDER BY n.created_at ASC
    LIMIT 1;

    -- re-parent children of each duplicate into the winner, then soft-delete
    FOR loser IN
      SELECT n.note_id
      FROM app.notes n
      WHERE n.user_id = grp.user_id
        AND n.title = grp.title
        AND n.is_folder = true
        AND n.deleted = 0
        AND n.note_id != winner_id
    LOOP
      -- move children to the winner folder
      UPDATE app.tree_items
      SET parent_id = winner_id
      WHERE parent_id = loser.note_id
        AND user_id = grp.user_id;

      -- soft-delete the empty duplicate
      UPDATE app.notes
      SET deleted = 1, deleted_at = NOW()
      WHERE note_id = loser.note_id;
    END LOOP;

    RAISE NOTICE 'Merged % duplicate folders for "%" (user %)', grp.cnt - 1, grp.title, grp.user_id;
  END LOOP;

  -- also deduplicate module subfolders (same title under same parent)
  FOR grp IN
    SELECT t.user_id, t.parent_id, n.title, COUNT(*) AS cnt,
           MIN(n.created_at) AS earliest
    FROM app.notes n
    JOIN app.tree_items t ON t.user_id = n.user_id AND t.note_id = n.note_id
    WHERE n.is_folder = true
      AND n.deleted = 0
      AND t.parent_id IS NOT NULL
    GROUP BY t.user_id, t.parent_id, n.title
    HAVING COUNT(*) > 1
  LOOP
    SELECT n.note_id INTO winner_id
    FROM app.notes n
    JOIN app.tree_items t ON t.user_id = n.user_id AND t.note_id = n.note_id
    WHERE n.user_id = grp.user_id
      AND t.parent_id = grp.parent_id
      AND n.title = grp.title
      AND n.is_folder = true
      AND n.deleted = 0
    ORDER BY n.created_at ASC
    LIMIT 1;

    FOR loser IN
      SELECT n.note_id
      FROM app.notes n
      JOIN app.tree_items t ON t.user_id = n.user_id AND t.note_id = n.note_id
      WHERE n.user_id = grp.user_id
        AND t.parent_id = grp.parent_id
        AND n.title = grp.title
        AND n.is_folder = true
        AND n.deleted = 0
        AND n.note_id != winner_id
    LOOP
      UPDATE app.tree_items
      SET parent_id = winner_id
      WHERE parent_id = loser.note_id
        AND user_id = grp.user_id;

      UPDATE app.notes
      SET deleted = 1, deleted_at = NOW()
      WHERE note_id = loser.note_id;
    END LOOP;
  END LOOP;
END $$;

-- ============================================================================
-- STEP 6: Backfill canvas_course_id on surviving course folders
--
-- Uses canvas_imports to identify which course a folder belongs to by looking
-- at the note_id -> canvas_course_id mapping through imported files.
-- ============================================================================
UPDATE app.notes n
SET canvas_course_id = sub.course_id
FROM (
  SELECT DISTINCT ON (ci.note_id)
    t.parent_id AS folder_note_id,
    ci.canvas_course_id AS course_id
  FROM app.canvas_imports ci
  JOIN app.notes file_note ON file_note.note_id = ci.note_id
  JOIN app.tree_items t ON t.note_id = ci.note_id AND t.user_id = ci.user_id
  WHERE ci.status = 'complete'
    AND ci.note_id IS NOT NULL
    AND t.parent_id IS NOT NULL
) sub
WHERE n.note_id = sub.folder_note_id
  AND n.is_folder = true
  AND n.canvas_course_id IS NULL;

-- also backfill course-level folders (parent of module folders)
UPDATE app.notes n
SET canvas_course_id = child.canvas_course_id
FROM (
  SELECT DISTINCT t.parent_id, n2.canvas_course_id
  FROM app.notes n2
  JOIN app.tree_items t ON t.note_id = n2.note_id AND t.user_id = n2.user_id
  WHERE n2.canvas_course_id IS NOT NULL
    AND n2.is_folder = true
    AND t.parent_id IS NOT NULL
) child
WHERE n.note_id = child.parent_id
  AND n.is_folder = true
  AND n.canvas_course_id IS NULL
  AND child.canvas_course_id IS NOT NULL;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
SELECT 'Canvas overhaul migration complete' AS status;

SELECT 'New columns on app.notes:' AS note;
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'app' AND table_name = 'notes'
  AND column_name IN ('canvas_course_id', 'canvas_module_id', 'canvas_assignment_id', 'canvas_academic_year')
ORDER BY column_name;

SELECT 'New columns on app.canvas_import_jobs:' AS note;
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'app' AND table_name = 'canvas_import_jobs'
  AND column_name IN ('job_type', 'expected_total')
ORDER BY column_name;

SELECT 'Duplicate folders cleaned:' AS note;
SELECT COUNT(*) AS soft_deleted_dupes
FROM app.notes
WHERE is_folder = true AND deleted = 1 AND deleted_at >= NOW() - INTERVAL '1 minute';
