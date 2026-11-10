SET LOCAL lock_timeout = '3s';

-- canvas module order for module folders, so a course reads in the order the
-- lecturer set. null for anything canvas didn't create or hasn't synced since.
-- discovery fills it in on the next sync
ALTER TABLE app.notes ADD COLUMN IF NOT EXISTS canvas_module_position INTEGER;

-- when the user last changed a note's title or content. updated_at moves on
-- imports, extraction, reindexing, pins and moves, so it can't drive a recent
-- sort. only the note PATCH route sets this, and it bumps the note's folders
-- too so a folder reads as recent as its newest edit
ALTER TABLE app.notes ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

-- the baseline trigger stamps updated_at on every update. left on, this backfill
-- would move every note's updated_at to now, which is the editor's save fence and
-- the source it copies from, so it is off for this transaction only
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'app.notes'::regclass
      AND tgname = 'update_notes_updated_at_trigger'
      AND tgenabled <> 'D'
  ) THEN
    ALTER TABLE app.notes DISABLE TRIGGER update_notes_updated_at_trigger;
    CREATE TEMP TABLE reenable_notes_trigger ON COMMIT DROP AS SELECT 1;
  END IF;
END $$;

-- updated_at is the best guess we have for existing notes. canvas imports stay
-- null like new imports do, since their updated_at mostly records syncs
UPDATE app.notes SET edited_at = updated_at
WHERE edited_at IS NULL
  AND canvas_course_id IS NULL
  AND canvas_import_id IS NULL;

-- then give each folder its newest live descendant, the same rule the route keeps from now on
WITH RECURSIVE ancestry AS (
  SELECT tree.user_id, tree.parent_id AS folder_id, n.edited_at, 1 AS depth
  FROM app.tree_items tree
  JOIN app.notes n ON n.note_id = tree.note_id AND n.user_id = tree.user_id
  WHERE tree.parent_id IS NOT NULL
    AND n.deleted_at IS NULL
    AND n.is_import_cache_source = FALSE
  UNION ALL
  SELECT ancestry.user_id, tree.parent_id, ancestry.edited_at, ancestry.depth + 1
  FROM ancestry
  JOIN app.tree_items tree ON tree.note_id = ancestry.folder_id AND tree.user_id = ancestry.user_id
  WHERE tree.parent_id IS NOT NULL AND ancestry.depth < 50
),
newest AS (
  SELECT user_id, folder_id, MAX(edited_at) AS edited_at
  FROM ancestry
  GROUP BY user_id, folder_id
)
UPDATE app.notes folder
SET edited_at = newest.edited_at
FROM newest
WHERE folder.user_id = newest.user_id
  AND folder.note_id = newest.folder_id
  AND folder.is_folder
  AND newest.edited_at > folder.edited_at;

DO $$
BEGIN
  IF to_regclass('pg_temp.reenable_notes_trigger') IS NOT NULL THEN
    ALTER TABLE app.notes ENABLE TRIGGER update_notes_updated_at_trigger;
  END IF;
END $$;
