-- Repair tree rows that point at themselves, then prevent recurrence.
UPDATE app.tree_items
SET parent_id = NULL,
    updated_at = NOW()
WHERE parent_id = note_id;

ALTER TABLE app.tree_items
  DROP CONSTRAINT IF EXISTS tree_items_no_self_parent;

ALTER TABLE app.tree_items
  ADD CONSTRAINT tree_items_no_self_parent
  CHECK (parent_id IS NULL OR parent_id <> note_id);
