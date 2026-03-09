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
        ti.id,
        ti.note_id,
        ti.parent_id,
        ti.is_expanded
      FROM app.tree_items ti
      LEFT JOIN app.notes n ON ti.note_id = n.note_id
      WHERE ti.user_id = ${userId}::uuid
        AND (ti.note_id IS NULL OR (n.deleted = 0 AND n.deleted_at IS NULL))
      ORDER BY ti.parent_id, ti.position
    `;

    // Build tree structure from flat results
    const items = {
      [ROOT_ID]: {
        id: ROOT_ID,
        children: [],
      },
    };

    // First pass: create all items (use note_id, not ti.id!)
    for (const row of rows) {
      const noteId = String(row.note_id);
      items[noteId] = {
        id: noteId,  // Use UUID note_id, not INTEGER tree_items.id
        children: [],
        isExpanded: row.is_expanded ?? false,
      };
    }

    // Second pass: build parent-child relationships
    for (const row of rows) {
      const noteId = String(row.note_id);
      const parentId = row.parent_id ? String(row.parent_id) : ROOT_ID;
      if (!items[parentId]) {
        items[parentId] = {
          id: parentId,
          children: [],
        };
      }
      items[parentId].children.push(noteId);
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
    // Note: tree_items.parent_id is INTEGER (not UUID)
    // For now, all notes go to root (parent_id = NULL)
    const actualParentId = null;

    // Get max position for this parent
    const posResult = await sql`
      SELECT COALESCE(MAX(position), 0) as max_pos
      FROM app.tree_items
      WHERE user_id = ${userId}::uuid AND parent_id IS NULL
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
      WHERE user_id = $1 AND note_id = $2::uuid
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
    // Note: tree_items.parent_id is INTEGER (not UUID)
    // For now, all notes stay at root (parent_id = NULL)
    const actualParentId = null;

    // Get current position if not specified
    let position = newPosition;
    if (position === undefined) {
      const posResult = await sql`
        SELECT COALESCE(MAX(position), 0) as max_pos
        FROM app.tree_items
        WHERE user_id = ${userId}::uuid AND parent_id IS NULL
      `;
      position = (posResult[0]?.max_pos || 0) + 1;
    }

    await sql`
      UPDATE app.tree_items
      SET position = ${position}, updated_at = NOW()
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
    // Delete tree items for notes that no longer exist (or are soft-deleted)
    await sql`
      DELETE FROM app.tree_items
      WHERE user_id = ${userId}::uuid
        AND note_id IS NOT NULL
        AND note_id NOT IN (
          SELECT note_id FROM app.notes 
          WHERE user_id = ${userId}::uuid 
            AND deleted = 0 
            AND deleted_at IS NULL
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
        AND deleted = 0
        AND deleted_at IS NULL
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
