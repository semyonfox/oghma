import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { isValidUUID } from "@/lib/utils/uuid";
import { withErrorHandler, tracedError } from "@/lib/api-error";
import sql from "@/database/pgsql.js";

type NoteRouteContext = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(
  async (_request: NextRequest, { params }: NoteRouteContext) => {
    const user = await validateSession();
    if (!user) return tracedError("Unauthorized", 401);

    const { id } = await params;
    if (!isValidUUID(id)) return tracedError("Invalid note ID", 400);

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
