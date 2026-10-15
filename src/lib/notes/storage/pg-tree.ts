// PostgreSQL-backed tree storage. Each user has an isolated tree, and every
// structural write takes the same user-scoped advisory lock as note creation
// and Trash transitions.
import sql from '@/database/pgsql';
import type { TreeMoveResult } from '@/lib/notes/types/tree';

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

export class TreeMoveConflictError extends Error {
  constructor() {
    super('Tree item parent changed');
    this.name = 'TreeMoveConflictError';
  }
}

interface TreeRelationshipRow {
  note_id: string;
  parent_id: string | null;
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

/** Persist one live item's expansion state. */
export async function updateTreeItem(
  userId: string,
  noteId: string,
  updates: { isExpanded: boolean },
): Promise<void> {
  const rows = await sql<{ note_id: string }[]>`
    UPDATE app.tree_items tree
    SET is_expanded = ${updates.isExpanded},
        updated_at = NOW()
    FROM app.notes note
    WHERE tree.user_id = ${userId}::uuid
      AND tree.note_id = ${noteId}::uuid
      AND note.note_id = tree.note_id
      AND note.user_id = tree.user_id
      AND note.deleted_at IS NULL
    RETURNING tree.note_id
  `;
  if (!rows[0]) throw new TreeItemUnavailableError();
}

/**
 * Move one active note below an active folder (or root). Caller-side ordering
 * is optimistic only: the persisted tree is always title-sorted.
 */
export async function moveNoteInTree(
  userId: string,
  noteId: string,
  newParentId: string | null,
  expectedParentId?: string | null,
): Promise<TreeMoveResult> {
  const actualParentId = newParentId || null;

  return sql.begin(async (tx) => {
    // Serialize tree moves for one user before reading parent relationships.
    // The transaction-scoped advisory lock closes the race where two valid
    // snapshots could otherwise be updated into a cycle.
    await tx`
      SELECT pg_advisory_xact_lock(hashtextextended(${userId}::text, 0))
    `;

    const source = await tx<{ note_id: string; parent_id: string | null }[]>`
      SELECT tree.note_id, tree.parent_id
      FROM app.tree_items tree
      JOIN app.notes note
        ON note.note_id = tree.note_id
       AND note.user_id = tree.user_id
      WHERE tree.note_id = ${noteId}::uuid
        AND tree.user_id = ${userId}::uuid
        AND note.deleted_at IS NULL
      FOR UPDATE OF tree, note
    `;
    if (!source[0]) throw new TreeItemUnavailableError();

    const oldParentId = source[0].parent_id
      ? String(source[0].parent_id)
      : null;
    const normalizedExpectedParentId = expectedParentId
      ? expectedParentId.toLowerCase()
      : expectedParentId;
    if (
      expectedParentId !== undefined &&
      (oldParentId?.toLowerCase() ?? null) !== normalizedExpectedParentId
    ) {
      throw new TreeMoveConflictError();
    }

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

    const moved = await tx<{ note_id: string; parent_id: string | null }[]>`
      UPDATE app.tree_items
      SET parent_id = ${actualParentId}, updated_at = NOW()
      WHERE user_id = ${userId}::uuid AND note_id = ${noteId}::uuid
      RETURNING note_id, parent_id
    `;
    if (!moved[0]) throw new TreeItemUnavailableError();

    return {
      success: true,
      noteId: String(moved[0].note_id),
      oldParentId,
      newParentId: moved[0].parent_id ? String(moved[0].parent_id) : null,
    };
  });
}
