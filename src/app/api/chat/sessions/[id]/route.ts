import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { isValidUUID } from "@/lib/utils/uuid";
import { withErrorHandler, tracedError } from "@/lib/api-error";
import { normalizeChatSessionContext } from "@/lib/chat/session";
import sql from "@/database/pgsql.js";
import logger from "@/lib/logger";

type AuthResult =
  | { error: NextResponse }
  | { user: { user_id: string }; id: string };

async function authenticate(
  params: Promise<{ id: string }>,
): Promise<AuthResult> {
  const user = await validateSession();
  if (!user) return { error: tracedError("Unauthorized", 401) };
  const { id } = await params;
  if (!isValidUUID(id))
    return { error: tracedError("Invalid session id", 400) };
  return { user: user as { user_id: string }, id };
}

// GET /api/chat/sessions/:id — fetch all messages for a session
export const GET = withErrorHandler(
  async (
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    try {
      const auth = await authenticate(params);
      if ("error" in auth) return auth.error;
      const { user, id } = auth;

      const sessions = await sql`
            SELECT s.id, s.title, s.note_id, n.title AS note_title, s.context, s.created_at, s.updated_at
            FROM app.chat_sessions s
            LEFT JOIN app.notes n ON n.note_id = s.note_id AND n.user_id = s.user_id
            WHERE s.id = ${id}::uuid AND s.user_id = ${user.user_id}::uuid
        `;
      if (sessions.length === 0) {
        return tracedError("Session not found", 404);
      }

      const messages = await sql`
            SELECT m.id, m.role, m.content, m.sources, m.created_at
            FROM app.chat_messages m
            JOIN app.chat_sessions s ON s.id = m.session_id
            WHERE m.session_id = ${id}::uuid
              AND s.user_id = ${user.user_id}::uuid
            ORDER BY m.created_at
        `;

      return NextResponse.json({
        session: {
          ...sessions[0],
          context: normalizeChatSessionContext(sessions[0].context),
        },
        messages,
      });
    } catch (error) {
      logger.error("chat session GET error", { error });
      return tracedError("Failed to fetch session", 500);
    }
  },
);

// DELETE /api/chat/sessions/:id — delete a session and all its messages
export const DELETE = withErrorHandler(
  async (
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    try {
      const auth = await authenticate(params);
      if ("error" in auth) return auth.error;
      const { user, id } = auth;

      const deleted = await sql`
            DELETE FROM app.chat_sessions
            WHERE id = ${id}::uuid AND user_id = ${user.user_id}::uuid
            RETURNING id
        `;

      if (deleted.length === 0) {
        return tracedError("Session not found", 404);
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      logger.error("chat session DELETE error", { error });
      return tracedError("Failed to delete session", 500);
    }
  },
);
