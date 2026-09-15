import type postgres from "postgres";
import sql from "@/database/pgsql";

export interface CanvasTrashConflict {
  rootId: string;
  title: string;
  deletedAt: string;
}

export class CanvasTrashConflictError extends Error {
  constructor(readonly folders: CanvasTrashConflict[]) { super("Canvas folders are in Trash"); }
}

/** Offer the actual Trash bundle, including a non-Canvas ancestor if needed. */
export async function findCanvasTrashConflicts(userId: string, courseIds: string[], db?: postgres.TransactionSql): Promise<CanvasTrashConflict[]> {
  if (!db) return sql.begin((tx) => findCanvasTrashConflicts(userId, courseIds, tx));
  const rows = await db<{ root_id: string; title: string; deleted_at: Date | string }[]>`
    SELECT DISTINCT root.note_id AS root_id, root.title, root.deleted_at
    FROM app.notes folder
    JOIN app.notes root ON root.note_id = folder.trash_root_id AND root.user_id = folder.user_id
    WHERE folder.user_id = ${userId}::uuid AND folder.is_folder = TRUE
      AND folder.canvas_course_id = ANY(${courseIds}::bigint[])
      AND folder.deleted_at IS NOT NULL AND root.deleted_at IS NOT NULL
    ORDER BY root.title, root.note_id
  `;
  return rows.map((row) => ({ rootId: row.root_id, title: row.title,
    deletedAt: new Date(row.deleted_at).toISOString() }));
}
