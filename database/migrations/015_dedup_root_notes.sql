-- Migration 015: deduplicate root-level notes created by Canvas import bug
--
-- Context: findOrCreateNote used `parent_id = $1::uuid` which evaluates to
-- unknown when parent_id is NULL (root level). This meant re-imports never
-- found existing root notes and created duplicates each time.
--
-- Strategy: for each (user_id, title) group at root level with duplicates,
-- keep the oldest note (MIN created_at) and soft-delete the rest.
-- Safe to re-run — only touches notes not already deleted.

WITH duplicates AS (
  SELECT
    n.user_id,
    n.title,
    MIN(n.created_at) AS keep_created_at
  FROM app.notes n
  JOIN app.tree_items t ON t.note_id = n.note_id AND t.user_id = n.user_id
  WHERE t.parent_id IS NULL
    AND n.is_folder = false
    AND n.deleted = 0
    AND n.deleted_at IS NULL
  GROUP BY n.user_id, n.title
  HAVING COUNT(*) > 1
),
to_delete AS (
  SELECT n.note_id
  FROM app.notes n
  JOIN app.tree_items t ON t.note_id = n.note_id AND t.user_id = n.user_id
  JOIN duplicates d ON d.user_id = n.user_id AND d.title = n.title
  WHERE t.parent_id IS NULL
    AND n.is_folder = false
    AND n.deleted = 0
    AND n.deleted_at IS NULL
    AND n.created_at > d.keep_created_at
)
UPDATE app.notes
SET deleted = 1, deleted_at = NOW()
WHERE note_id IN (SELECT note_id FROM to_delete);
