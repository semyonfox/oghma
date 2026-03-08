// PostgreSQL-backed tree storage
// Each user has an isolated tree structure stored in the database
import sql from '@/database/pgsql.js';

const ROOT_ID = 'root';

/**
 * Get tree for a specific user from PostgreSQL
 */
export async function getTreeFromPG(userId) {
  try {
    const rows = await sql`
      SELECT 
        id,
        note_id,
        parent_id,
        is_expanded
      FROM app.tree_items
      WHERE user_id = ${userId}::uuid
      ORDER BY parent_id, position
    `;

    // Build tree structure from flat results
    const items = {
      [ROOT_ID]: {
        id: ROOT_ID,
        children: [],
      },
    };

    // First pass: create all items
    for (const row of rows) {
      items[row.id] = {
        id: String(row.id),
        children: [],
        isExpanded: row.is_expanded ?? false,
      };
    }

    // Second pass: build parent-child relationships
    for (const row of rows) {
      const parentId = row.parent_id ? String(row.parent_id) : ROOT_ID;
      if (!items[parentId]) {
        items[parentId] = {
          id: parentId,
          children: [],
        };
      }
      items[parentId].children.push(String(row.id));
    }

    return {
      rootId: ROOT_ID,
      items,
    };
  } catch (error) {
    console.error('Error reading tree from PG:', error);
    return {
      rootId: ROOT_ID,
      items: {
        [ROOT_ID]: {
          id: ROOT_ID,
          children: [],
        },
      },
    };
  }
}

/**
 * Add a note to user's tree
 */
export async function addNoteToTree(userId, noteId, parentId) {
  try {
    const actualParentId = parentId || null;

    // Get max position for this parent
    const posResult = await sql`
      SELECT COALESCE(MAX(position), 0) as max_pos
      FROM app.tree_items
      WHERE user_id = ${userId}::uuid AND parent_id IS ${actualParentId}
    `;

    const position = (posResult[0]?.max_pos || 0) + 1;

    await sql`
      INSERT INTO app.tree_items (user_id, note_id, parent_id, position)
      VALUES (${userId}::uuid, ${noteId}::uuid, ${actualParentId}, ${position})
    `;
  } catch (error) {
    console.error('Error adding note to tree:', error);
    throw error;
  }
}

/**
 * Remove a note from user's tree
 */
export async function removeNoteFromTree(userId, noteId) {
  try {
    await sql`
      DELETE FROM app.tree_items
      WHERE user_id = ${userId}::uuid AND note_id = ${noteId}::uuid
    `;
  } catch (error) {
    console.error('Error removing note from tree:', error);
    throw error;
  }
}

/**
 * Update tree item (e.g., expand/collapse)
 */
export async function updateTreeItem(userId, itemId, updates) {
  try {
    const setClauses = [];
    const values = [userId, itemId];

    if (updates.isExpanded !== undefined) {
      setClauses.push('is_expanded = $' + (values.length + 1));
      values.push(updates.isExpanded);
    }

    if (updates.parentId !== undefined) {
      setClauses.push('parent_id = $' + (values.length + 1));
      values.push(updates.parentId || null);
    }

    if (updates.position !== undefined) {
      setClauses.push('position = $' + (values.length + 1));
      values.push(updates.position);
    }

    if (setClauses.length === 0) return;

    const query = `
      UPDATE app.tree_items
      SET ${setClauses.join(', ')}, updated_at = NOW()
      WHERE user_id = $1 AND id = $2
    `;

    await sql.unsafe(query, values);
  } catch (error) {
    console.error('Error updating tree item:', error);
    throw error;
  }
}

/**
 * Move a note in the tree (reorder within parent or change parent)
 */
export async function moveNoteInTree(userId, noteId, newParentId, newPosition) {
  try {
    const actualParentId = newParentId === undefined ? null : newParentId;

    // Get current position if not specified
    let position = newPosition;
    if (position === undefined) {
      const posResult = await sql`
        SELECT COALESCE(MAX(position), 0) as max_pos
        FROM app.tree_items
        WHERE user_id = ${userId}::uuid AND parent_id IS ${actualParentId}
      `;
      position = (posResult[0]?.max_pos || 0) + 1;
    }

    await sql`
      UPDATE app.tree_items
      SET parent_id = ${actualParentId}, position = ${position}, updated_at = NOW()
      WHERE user_id = ${userId}::uuid AND note_id = ${noteId}::uuid
    `;
  } catch (error) {
    console.error('Error moving note in tree:', error);
    throw error;
  }
}

/**
 * Sync tree with actual notes (remove tree items for deleted notes)
 */
export async function syncTreeWithNotes(userId) {
  try {
    // Delete tree items for notes that no longer exist
    await sql`
      DELETE FROM app.tree_items
      WHERE user_id = ${userId}::uuid
        AND note_id IS NOT NULL
        AND note_id NOT IN (
          SELECT note_id FROM app.notes WHERE user_id = ${userId}::uuid
        )
    `;
  } catch (error) {
    console.error('Error syncing tree with notes:', error);
    throw error;
  }
}

/**
 * Get all notes not in tree (orphaned notes)
 */
export async function getOrphanedNotes(userId) {
  try {
    const rows = await sql`
      SELECT note_id
      FROM app.notes
      WHERE user_id = ${userId}::uuid
        AND note_id NOT IN (
          SELECT note_id FROM app.tree_items WHERE user_id = ${userId}::uuid AND note_id IS NOT NULL
        )
    `;

    return rows.map(row => row.note_id);
  } catch (error) {
    console.error('Error getting orphaned notes:', error);
    return [];
  }
}

/**
 * Rebuild tree for orphaned notes (add them to root)
 */
export async function rebuildOrphanedNotes(userId) {
  try {
    const orphaned = await getOrphanedNotes(userId);

    for (const noteId of orphaned) {
      await addNoteToTree(userId, noteId, null);
    }
  } catch (error) {
    console.error('Error rebuilding orphaned notes:', error);
    throw error;
  }
}
