import { NextRequest, NextResponse } from "next/server";
import {
  withErrorHandler,
  tracedError,
  requireAuth,
  requireValidId,
} from "@/lib/api-error";
import sql from "@/database/pgsql.js";

// GET /api/chat/sessions/:id — fetch all messages for a session
export const GET = withErrorHandler(
  async (
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const user = await requireAuth();
    const { id } = await params;
    requireValidId(id, "session id");

    const sessions = await sql`
        SELECT id, title, note_id, created_at, updated_at
        FROM app.chat_sessions
        WHERE id = ${id}::uuid AND user_id = ${user.user_id}::uuid
    `;
    if (sessions.length === 0) return tracedError("Session not found", 404);

    const messages = await sql`
        SELECT id, role, content, sources, created_at
        FROM app.chat_messages
        WHERE session_id = ${id}::uuid
        ORDER BY created_at
    `;

    return NextResponse.json({ session: sessions[0], messages });
  },
);

// DELETE /api/chat/sessions/:id — delete a session and all its messages
export const DELETE = withErrorHandler(
  async (
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const user = await requireAuth();
    const { id } = await params;
    requireValidId(id, "session id");

    const deleted = await sql`
        DELETE FROM app.chat_sessions
        WHERE id = ${id}::uuid AND user_id = ${user.user_id}::uuid
        RETURNING id
    `;
    if (deleted.length === 0) return tracedError("Session not found", 404);

    return NextResponse.json({ success: true });
  },
);
