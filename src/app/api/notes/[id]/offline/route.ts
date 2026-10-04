import { validateSession } from "@/lib/auth";
import { isValidUUID } from "@/lib/utils/uuid";
import sql from "@/database/pgsql";
import { withErrorHandler, tracedError } from "@/lib/api-error";
import { NextResponse } from "next/server";

interface SnapshotRow {
  note_id: string;
  title: string;
  content: string;
}

export const GET = withErrorHandler(
  async (
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const user = await validateSession();
    if (!user) return tracedError("Unauthorized", 401);
    const { id } = await params;
    if (!isValidUUID(id)) return tracedError("Invalid note ID", 400);

    // Owner and content come from the same authenticated request. Never pair a
    // separately fetched profile with a note fetched during an account switch.
    const [note] = await sql<SnapshotRow[]>`
    SELECT note_id, title, content FROM app.notes
    WHERE note_id = ${id}::uuid AND user_id = ${user.user_id}::uuid
      AND deleted_at IS NULL AND is_folder = false AND s3_key IS NULL
  `;
    if (!note)
      return tracedError(
        "Note not found or not available for offline reading",
        404,
      );
    if (note.content.length > 200_000 || note.title.length > 500) {
      return tracedError("This note is too large for offline reading", 413);
    }
    return NextResponse.json(
      {
        ownerId: user.user_id,
        note: {
          id: note.note_id,
          title: note.title,
          content: note.content,
          savedAt: new Date().toISOString(),
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  },
);
