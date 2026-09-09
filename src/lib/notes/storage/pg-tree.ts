// PostgreSQL-backed tree storage
// Each user has an isolated tree structure stored in the database
import sql from '@/database/pgsql';
import { cacheGet, cacheSet, cacheKeys } from '@/lib/cache';
import type { TreeData, TreeItem } from '@/lib/notes/types/tree';

const ROOT_ID = 'root';

export class TreeCycleError extends Error {
  constructor() {
    super('Cannot move an item inside itself');
    this.name = 'TreeCycleError';
  }
}

export class TreeParentError extends Error {
  constructor() {
    super('Parent folder does not exist or is unavailable');
    this.name = 'TreeParentError';
  }
}

export class TreeItemUnavailableError extends Error {
  constructor() {
    super('Tree item does not exist or is unavailable');
    this.name = 'TreeItemUnavailableError';
  }
}

interface TreeRelationshipRow {
  note_id: string;
  parent_id: string | null;
}

interface TreeQueryRow extends TreeRelationshipRow {
  id: number;
  is_expanded: boolean | null;
  title: string | null;
}

function assertValidTreeParent(
  rows: readonly TreeRelationshipRow[],
  noteId: string,
  newParentId: string | null,
): void {
  if (!newParentId) return;

  const parentByNote = new Map(
    rows.map((row) => [String(row.note_id), row.parent_id ? String(row.parent_id) : null]),
  );
  const visited = new Set<string>();
  let ancestorId: string | null = newParentId;

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
export async function getTreeFromPG(userId: string): Promise<TreeData> {
  try {
    const cached = await cacheGet<TreeData>(cacheKeys.treeFull(userId));
    if (cached) return cached;

    const rows = await sql<TreeQueryRow[]>`
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
    const items: Record<string, TreeItem> = {
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
      // Historical data can contain a live child below a deleted/missing
      // parent. Keep that child reachable at root rather than manufacturing an
      // invisible placeholder node. New lifecycle writes hide whole subtrees.
      const requestedParentId = row.parent_id ? String(row.parent_id) : ROOT_ID;
      const parentId = items[requestedParentId] ? requestedParentId : ROOT_ID;
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
export async function addNoteToTree(
  userId: string,
  noteId: string,
  parentId?: string | null,
): Promise<void> {
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
export async function removeNoteFromTree(
  userId: string,
  noteId: string,
): Promise<void> {
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

/** Persist one live item's expansion state and return its current parent. */
export async function updateTreeItem(
  userId: string,
  noteId: string,
  updates: { isExpanded: boolean },
): Promise<string | null> {
  try {
    const rows = await sql<{ parent_id: string | null }[]>`
      UPDATE app.tree_items tree
      SET is_expanded = ${updates.isExpanded},
          updated_at = NOW()
      FROM app.notes note
      WHERE tree.user_id = ${userId}::uuid
        AND tree.note_id = ${noteId}::uuid
        AND note.note_id = tree.note_id
        AND note.user_id = tree.user_id
        AND note.deleted_at IS NULL
      RETURNING tree.parent_id
    `;
    if (!rows[0]) throw new TreeItemUnavailableError();
    return rows[0].parent_id ?? null;
  } catch (error) {
    console.error('Error updating tree item:', error);
    throw error;
  }
}

/**
 * Move one active note below an active folder (or root). Caller-side ordering
 * is optimistic only: the persisted tree is always title-sorted.
 */
export async function moveNoteInTree(
  userId: string,
  noteId: string,
  newParentId: string | null,
): Promise<void> {
  try {
    const actualParentId = newParentId || null;

    await sql.begin(async (tx) => {
      // Serialize tree moves for one user before reading parent relationships.
      // The transaction-scoped advisory lock closes the race where two valid
      // snapshots could otherwise be updated into a cycle.
      await tx`
        SELECT pg_advisory_xact_lock(hashtextextended(${userId}::text, 0))
      `;

      const source = await tx`
        SELECT note_id
        FROM app.notes
        WHERE note_id = ${noteId}::uuid
          AND user_id = ${userId}::uuid
          AND deleted_at IS NULL
        FOR UPDATE
      `;
      if (!source[0]) throw new TreeItemUnavailableError();

      if (actualParentId) {
        const parent = await tx`
          SELECT note_id
          FROM app.notes
          WHERE note_id = ${actualParentId}::uuid
            AND user_id = ${userId}::uuid
            AND is_folder = TRUE
            AND deleted_at IS NULL
          FOR SHARE
        `;
        if (!parent[0]) throw new TreeParentError();
      }

      const rows = await tx<TreeRelationshipRow[]>`
        WITH RECURSIVE ancestors AS (
          SELECT note_id, parent_id
          FROM app.tree_items
          WHERE user_id = ${userId}::uuid AND note_id = ${actualParentId}::uuid
          UNION
          SELECT parent.note_id, parent.parent_id
          FROM app.tree_items parent
          JOIN ancestors child ON parent.note_id = child.parent_id
          WHERE parent.user_id = ${userId}::uuid
        )
        SELECT note_id, parent_id FROM ancestors
      `;

      assertValidTreeParent(rows, String(noteId), actualParentId && String(actualParentId));

      const moved = await tx`
        UPDATE app.tree_items
        SET parent_id = ${actualParentId}, updated_at = NOW()
        WHERE user_id = ${userId}::uuid AND note_id = ${noteId}::uuid
        RETURNING note_id
      `;
      if (!moved[0]) throw new TreeItemUnavailableError();
    });
  } catch (error) {
    console.error('Error moving note in tree:', error);
    throw error;
  }
}
