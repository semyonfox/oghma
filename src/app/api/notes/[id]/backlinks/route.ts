import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  requireValidId,
  type RouteParamsContext,
  withErrorHandler,
} from "@/lib/api-error";
import sql from "@/database/pgsql";

export const GET = withErrorHandler(
  async (_request: NextRequest, { params }: RouteParamsContext<{ id: string }>) => {
    const user = await requireAuth();

    const { id } = await params;
    requireValidId(id, "note ID");

    const incoming = await sql`
      SELECT source.note_id AS id, source.title,
             LEFT(COALESCE(source.content, ''), 280) AS excerpt
      FROM app.note_links link
      JOIN app.notes source
        ON source.note_id = link.source_note_id
       AND source.user_id = link.user_id
       AND source.deleted_at IS NULL
      WHERE link.user_id = ${user.user_id}::uuid
        AND link.target_note_id = ${id}::uuid
      ORDER BY source.updated_at DESC
    `;

    const outgoing = await sql`
      SELECT target.note_id AS id, target.title,
             LEFT(COALESCE(target.content, ''), 280) AS excerpt
      FROM app.note_links link
      JOIN app.notes target
        ON target.note_id = link.target_note_id
       AND target.user_id = link.user_id
       AND target.deleted_at IS NULL
      WHERE link.user_id = ${user.user_id}::uuid
        AND link.source_note_id = ${id}::uuid
      ORDER BY target.title ASC
    `;

    return NextResponse.json({ incoming, outgoing });
  },
);
