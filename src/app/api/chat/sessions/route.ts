import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { withErrorHandler, tracedError } from "@/lib/api-error";
import { normalizeChatSessionContext } from "@/lib/chat/session";
import sql from "@/database/pgsql.js";
import logger from "@/lib/logger";

// GET /api/chat/sessions — list the current user's chat sessions
export const GET = withErrorHandler(async () => {
  try {
    const user = await validateSession();
    if (!user) {
      return tracedError("Unauthorized", 401);
    }

    const sessions = await sql`
            SELECT s.id, s.title, s.note_id, n.title AS note_title, s.context, s.created_at, s.updated_at,
                   COUNT(m.id)::int AS message_count
            FROM app.chat_sessions s
            LEFT JOIN app.notes n
              ON n.note_id = s.note_id
             AND n.user_id = s.user_id
             AND n.deleted = 0
             AND n.deleted_at IS NULL
            LEFT JOIN app.chat_messages m ON m.session_id = s.id
            WHERE s.user_id = ${user.user_id}::uuid
            GROUP BY s.id, n.title
            ORDER BY s.updated_at DESC
            LIMIT 100
        `;

    return NextResponse.json({
      sessions: sessions.map((session: any) => ({
        ...session,
        context: normalizeChatSessionContext(session.context),
      })),
    });
  } catch (error) {
    logger.error("chat sessions GET error", { error });
    return tracedError("Failed to fetch sessions", 500);
  }
});
