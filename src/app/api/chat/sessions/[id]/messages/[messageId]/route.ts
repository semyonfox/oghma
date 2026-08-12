import { NextRequest, NextResponse } from "next/server";
import {
  parseJsonObject,
  requireAuth,
  requireValidId,
  tracedError,
  withErrorHandler,
} from "@/lib/api-error";
import sql from "@/database/pgsql";

// PATCH /api/chat/sessions/:id/messages/:messageId — set thumbs up/down rating
export const PATCH = withErrorHandler(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string; messageId: string }> },
  ) => {
    const user = await requireAuth();
    const path = await params;
    const sessionId = requireValidId(path.id, "session id");
    const messageId = requireValidId(path.messageId, "message id");
    const { rating } = await parseJsonObject(request);

    if (rating !== 1 && rating !== -1 && rating !== null) {
      return tracedError("rating must be 1, -1, or null", 400);
    }

    const updated = await sql`
      UPDATE app.chat_messages m
      SET rating = ${rating}
      FROM app.chat_sessions s
      WHERE m.id = ${messageId}::uuid
        AND m.session_id = ${sessionId}::uuid
        AND s.id = m.session_id
        AND s.user_id = ${user.user_id}::uuid
      RETURNING m.id
    `;

    if (updated.length === 0) {
      return tracedError("Message not found", 404);
    }

    return NextResponse.json({ success: true });
  },
);
