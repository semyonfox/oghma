-- Remove duplicate tree links, keeping the most recently updated row per note.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, note_id
      ORDER BY updated_at DESC, id DESC
    ) AS row_num
  FROM app.tree_items
  WHERE note_id IS NOT NULL
)
DELETE FROM app.tree_items
WHERE id IN (
  SELECT id
  FROM ranked
  WHERE row_num > 1
);

-- Enforce the assumption used throughout the app: one tree row per user/note.
CREATE UNIQUE INDEX IF NOT EXISTS tree_items_user_note_unique
ON app.tree_items (user_id, note_id)
WHERE note_id IS NOT NULL;
