import { NextResponse } from "next/server";
import { ApiError, withErrorHandler, requireAuth } from "@/lib/api-error";
import { normalizeChatSessionContext } from "@/lib/chat/session";
import sql from "@/database/pgsql";

interface ChatSessionListRow {
  id: string;
  title: string;
  pinned: boolean;
  note_id: string | null;
  note_title: string | null;
  context: unknown;
  generation_status: string;
  created_at: string | Date;
  updated_at: string | Date;
  message_count: number;
}

// GET /api/chat/sessions — list the current user's chat sessions
export const GET = withErrorHandler(async () => {
  try {
    const user = await requireAuth();

    const sessions = (await sql`
      SELECT s.id, s.title, s.pinned, s.note_id, n.title AS note_title, s.context,
             s.generation_status, s.created_at, s.updated_at,
             COUNT(m.id)::int AS message_count
      FROM app.chat_sessions s
      LEFT JOIN app.notes n
        ON n.note_id = s.note_id
       AND n.user_id = s.user_id
       AND n.deleted_at IS NULL
      LEFT JOIN app.chat_messages m ON m.session_id = s.id
      WHERE s.user_id = ${user.user_id}::uuid
      GROUP BY s.id, n.title
      ORDER BY s.pinned DESC, s.updated_at DESC
      LIMIT 100
    `) as ChatSessionListRow[];

    return NextResponse.json({
      sessions: sessions.map((session) => ({
        ...session,
        context: normalizeChatSessionContext(session.context),
      })),
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      500,
      "Failed to fetch sessions",
      error instanceof Error ? error.message : String(error),
    );
  }
});
