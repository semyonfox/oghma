import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  requireValidId,
  type RouteParamsContext,
  withErrorHandler,
} from "@/lib/api-error";
import sql from "@/database/pgsql";

// ancestor folders of a note, outermost first, for the editor breadcrumb
export const GET = withErrorHandler(
  async (_request: NextRequest, { params }: RouteParamsContext<{ id: string }>) => {
    const user = await requireAuth();

    const { id } = await params;
    requireValidId(id, "note ID");

    const rows = await sql<{ id: string; title: string | null; depth: number }[]>`
      WITH RECURSIVE ancestors AS (
        SELECT parent_id, 1 AS depth
        FROM app.tree_items
        WHERE user_id = ${user.user_id}::uuid AND note_id = ${id}::uuid
        UNION ALL
        SELECT item.parent_id, ancestors.depth + 1
        FROM app.tree_items item
        JOIN ancestors ON item.note_id = ancestors.parent_id
        WHERE item.user_id = ${user.user_id}::uuid AND ancestors.depth < 32
      )
      SELECT folder.note_id AS id, folder.title, ancestors.depth
      FROM ancestors
      JOIN app.notes folder
        ON folder.note_id = ancestors.parent_id
       AND folder.user_id = ${user.user_id}::uuid
       AND folder.deleted_at IS NULL
      ORDER BY ancestors.depth DESC
    `;

    return NextResponse.json({
      path: rows.map(({ id: folderId, title }) => ({ id: folderId, title })),
    });
  },
);
