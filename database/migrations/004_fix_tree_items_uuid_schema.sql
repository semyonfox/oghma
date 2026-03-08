-- Fix tree_items schema: Convert parent_id from INTEGER to UUID
-- Also convert id to UUID for consistency

BEGIN;

-- Drop existing indexes on tree_items
DROP INDEX IF EXISTS idx_tree_items_parent_position;
DROP INDEX IF EXISTS idx_tree_items_user_parent;

-- Create new columns with correct types
ALTER TABLE app.tree_items
ADD COLUMN parent_id_new UUID DEFAULT NULL,
ADD COLUMN id_new UUID DEFAULT gen_random_uuid();

-- Copy data: Convert parent_id integers to NULL (they were row IDs, not note IDs)
-- In a UUID-based system, parent_id should reference note_id (UUID), not tree id (integer)
UPDATE app.tree_items
SET parent_id_new = NULL;  -- All parents become NULL since old parent_id was tree row id, not note id

-- Drop old columns
ALTER TABLE app.tree_items
DROP COLUMN parent_id,
DROP COLUMN id;

-- Rename new columns
ALTER TABLE app.tree_items
RENAME COLUMN parent_id_new TO parent_id;
RENAME COLUMN id_new TO id;

-- Add PRIMARY KEY on id (UUID)
ALTER TABLE app.tree_items
ADD PRIMARY KEY (id);

-- Recreate indexes with UUID support
CREATE INDEX idx_tree_items_parent_position
ON app.tree_items(parent_id, position)
WHERE note_id IS NOT NULL;

CREATE INDEX idx_tree_items_user_parent
ON app.tree_items(user_id, parent_id);

COMMIT;
