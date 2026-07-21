// PostgreSQL-backed tree storage
// Each user has an isolated tree structure stored in the database
import sql from '@/database/pgsql.js';
import { cacheGet, cacheSet, cacheKeys } from '@/lib/cache';

const ROOT_ID = 'root';

export class TreeCycleError extends Error {
  constructor() {
    super('Cannot move an item inside itself');
    this.name = 'TreeCycleError';
  }
}

function assertValidTreeParent(rows, noteId, newParentId) {
  if (!newParentId) return;

  const parentByNote = new Map(
    rows.map((row) => [String(row.note_id), row.parent_id ? String(row.parent_id) : null]),
  );
  const visited = new Set();
  let ancestorId = newParentId;

  while (ancestorId) {
    if (ancestorId === noteId || visited.has(ancestorId)) {
      throw new TreeCycleError();
    }
    visited.add(ancestorId);
    ancestorId = parentByNote.get(ancestorId) ?? null;
  }
}

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
        AND (ti.note_id IS NULL OR n.deleted_at IS NULL)
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
    // tree_items.parent_id is UUID and references the parent note's UUID
    // If no parentId provided, note is added to root (parent_id = NULL)
    const actualParentId = parentId || null;

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
      await moveNoteInTree(userId, noteId, updates.parentId);
    }
  } catch (error) {
    console.error('Error updating tree item:', error);
    throw error;
  }
}

/**
 * Move a note in the tree (change parent, will sort A-Z)
 */
export async function moveNoteInTree(userId, noteId, newParentId) {
  try {
    const actualParentId = newParentId || null;

    await sql.begin(async (tx) => {
      // Serialize tree moves for one user before reading parent relationships.
      // The transaction-scoped advisory lock closes the race where two valid
      // snapshots could otherwise be updated into a cycle.
      await tx`
        SELECT pg_advisory_xact_lock(hashtextextended(${userId}::text, 0))
      `;

      const rows = await tx`
        SELECT note_id, parent_id
        FROM app.tree_items
        WHERE user_id = ${userId}::uuid
        FOR UPDATE
      `;

      assertValidTreeParent(rows, String(noteId), actualParentId && String(actualParentId));

      await tx`
        UPDATE app.tree_items
        SET parent_id = ${actualParentId}, updated_at = NOW()
        WHERE user_id = ${userId}::uuid AND note_id = ${noteId}::uuid
      `;
    });
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
