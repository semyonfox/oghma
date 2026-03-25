// PostgreSQL-backed tree storage
// Each user has an isolated tree structure stored in the database
import sql from '@/database/pgsql.js';
import { cacheGet, cacheSet, cacheKeys } from '@/lib/cache';

const ROOT_ID = 'root';

/**
 * Get tree for a specific user from PostgreSQL (sorted A-Z by title)
 */
export async function getTreeFromPG(userId) {
  try {
    const cached = await cacheGet(cacheKeys.treeFull(userId));
    if (cached) return cached;

    const rows = await sql`
      SELECT 
        ti.id,
        ti.note_id,
        ti.parent_id,
        ti.is_expanded,
        n.title
      FROM app.tree_items ti
      LEFT JOIN app.notes n ON ti.note_id = n.note_id
      WHERE ti.user_id = ${userId}::uuid
        AND (ti.note_id IS NULL OR (n.deleted = 0 AND n.deleted_at IS NULL))
      ORDER BY ti.parent_id, n.title ASC
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

    // Second pass: build parent-child relationships (skip self-references)
    for (const row of rows) {
      const noteId = String(row.note_id);
      let parentId = row.parent_id ? String(row.parent_id) : ROOT_ID;

      // prevent self-referencing cycle
      if (parentId === noteId) {
        console.warn(`[pg-tree] getTreeFromPG: fixing self-referencing note ${noteId}`);
        parentId = ROOT_ID;
      }

      if (!items[parentId]) {
        items[parentId] = {
          id: parentId,
          children: [],
        };
      }
      items[parentId].children.push(noteId);
    }

    const tree = { rootId: ROOT_ID, items };
    await cacheSet(cacheKeys.treeFull(userId), tree, 300);
    return tree;
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
 * Add a note to user's tree (sorted A-Z by title)
 * Idempotent: if note is already in tree, silently succeeds
 */
export async function addNoteToTree(userId, noteId, parentId) {
  try {
    const actualParentId = parentId || null;

    // reject self-referencing parent
    if (actualParentId && actualParentId === noteId) {
      console.warn(`[pg-tree] addNoteToTree: rejecting self-referencing parent (${noteId})`);
      return addNoteToTree(userId, noteId, null); // fall back to root
    }

    await sql`
      INSERT INTO app.tree_items (user_id, note_id, parent_id)
      VALUES (${userId}::uuid, ${noteId}::uuid, ${actualParentId})
      ON CONFLICT (user_id, note_id) DO NOTHING
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
 * Update tree item (e.g., expand/collapse, move to parent)
 */
export async function updateTreeItem(userId, noteId, updates) {
  try {
    if (updates.isExpanded !== undefined) {
      await sql`
        UPDATE app.tree_items
        SET is_expanded = ${updates.isExpanded},
            updated_at = NOW()
        WHERE user_id = ${userId}::uuid AND note_id = ${noteId}::uuid
      `;
    }

    if (updates.parentId !== undefined) {
      await sql`
        UPDATE app.tree_items
        SET parent_id = ${updates.parentId || null},
            updated_at = NOW()
        WHERE user_id = ${userId}::uuid AND note_id = ${noteId}::uuid
      `;
    }
  } catch (error) {
    console.error('Error updating tree item:', error);
    throw error;
  }
}

/**
 * Move a note in the tree (change parent, will sort A-Z)
 * Rejects moves that would create cycles (self-reference or ancestor loop)
 */
export async function moveNoteInTree(userId, noteId, newParentId) {
  try {
    const actualParentId = newParentId || null;

    // reject self-referencing parent
    if (actualParentId && actualParentId === noteId) {
      throw new Error('Cannot move a note into itself');
    }

    // walk the ancestor chain of the destination to detect cycles
    if (actualParentId) {
      const ancestors = await sql`
        WITH RECURSIVE chain AS (
          SELECT parent_id FROM app.tree_items
          WHERE user_id = ${userId}::uuid AND note_id = ${actualParentId}::uuid
          UNION ALL
          SELECT ti.parent_id FROM app.tree_items ti
          JOIN chain c ON ti.note_id = c.parent_id
          WHERE ti.user_id = ${userId}::uuid AND ti.parent_id IS NOT NULL
        )
        SELECT parent_id FROM chain
      `;
      const ancestorIds = new Set(ancestors.map(r => String(r.parent_id)));
      if (ancestorIds.has(noteId)) {
        throw new Error('Cannot move a folder into its own descendant');
      }
    }

    await sql`
      UPDATE app.tree_items
      SET parent_id = ${actualParentId}, updated_at = NOW()
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
