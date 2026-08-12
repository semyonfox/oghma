import { NextRequest, NextResponse } from "next/server";
import {
  ApiError,
  parseJsonObject,
  requireAuth,
  requireValidId,
  tracedError,
  withErrorHandler,
} from "@/lib/api-error";
import { normalizeChatSessionContext } from "@/lib/chat/session";
import sql from "@/database/pgsql";
import {
  loadOwnedChatGeneration,
  requestChatGenerationCancel,
} from "@/lib/chat/generation-store";

const GENERATION_STOP_TIMEOUT_MS = 6_000;
const GENERATION_STOP_POLL_MS = 100;

async function authenticateSessionRequest(
  params: Promise<{ id: string }>,
): Promise<{ userId: string; sessionId: string }> {
  const user = await requireAuth();
  const { id } = await params;
  return {
    userId: user.user_id,
    sessionId: requireValidId(id, "session id"),
  };
}

async function stopActiveSessionGenerations(
  sessionId: string,
  userId: string,
): Promise<boolean> {
  const active = await sql<Array<{ id: string }>>`
    SELECT id
    FROM app.chat_generations
    WHERE session_id = ${sessionId}::uuid
      AND user_id = ${userId}::uuid
      AND status IN ('queued', 'generating')
  `;
  const generationIds = active.map((row) => row.id);
  if (generationIds.length === 0) return true;

  await Promise.all(
    generationIds.map((generationId: string) =>
      requestChatGenerationCancel(generationId),
    ),
  );
  const deadline = Date.now() + GENERATION_STOP_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const records = await Promise.all(
      generationIds.map((id: string) => loadOwnedChatGeneration(id, userId)),
    );
    if (
      records.every(
        (record) =>
          !record ||
          record.status === "completed" ||
          record.status === "failed" ||
          record.status === "cancelled",
      )
    ) {
      return true;
    }
    await new Promise<void>((resolve) =>
      setTimeout(resolve, GENERATION_STOP_POLL_MS),
    );
  }

  return false;
}

// GET /api/chat/sessions/:id — fetch all messages for a session
export const GET = withErrorHandler(
  async (
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    try {
      const { userId, sessionId } = await authenticateSessionRequest(params);

      const sessions = await sql`
        SELECT s.id, s.title, s.note_id, n.title AS note_title, s.context,
               s.generation_status, s.created_at, s.updated_at,
               (
                 SELECT g.id FROM app.chat_generations g
                 WHERE g.session_id = s.id
                   AND g.status IN ('queued', 'generating')
                 ORDER BY g.created_at DESC LIMIT 1
               ) AS active_generation_id
        FROM app.chat_sessions s
        LEFT JOIN app.notes n
          ON n.note_id = s.note_id
         AND n.user_id = s.user_id
         AND n.deleted_at IS NULL
        WHERE s.id = ${sessionId}::uuid AND s.user_id = ${userId}::uuid
      `;
      if (sessions.length === 0) {
        return tracedError("Session not found", 404);
      }

      const messages = await sql`
        SELECT m.id, m.role, m.content, m.parts, m.sources, m.metadata, m.created_at
        FROM app.chat_messages m
        JOIN app.chat_sessions s ON s.id = m.session_id
        WHERE m.session_id = ${sessionId}::uuid
          AND s.user_id = ${userId}::uuid
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
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        500,
        "Failed to fetch session",
        error instanceof Error ? error.message : String(error),
      );
    }
  },
);

// PATCH /api/chat/sessions/:id — rename or pin a session
export const PATCH = withErrorHandler(
  async (
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const { userId, sessionId } = await authenticateSessionRequest(params);
    const body = await parseJsonObject(req);
    const title = typeof body.title === "string" ? body.title.trim() : undefined;
    const pinned = typeof body.pinned === "boolean" ? body.pinned : undefined;

    if (title === "" || (title !== undefined && title.length > 200)) {
      return tracedError("Title must be between 1 and 200 characters", 400);
    }
    if (title === undefined && pinned === undefined) {
      return tracedError("No supported changes provided", 400);
    }

    const [updated] = title !== undefined && pinned !== undefined
      ? await sql`
          UPDATE app.chat_sessions
          SET title = ${title}, pinned = ${pinned}, updated_at = NOW()
          WHERE id = ${sessionId}::uuid AND user_id = ${userId}::uuid
          RETURNING id, title, pinned, updated_at
        `
      : title !== undefined
        ? await sql`
            UPDATE app.chat_sessions
            SET title = ${title}, updated_at = NOW()
            WHERE id = ${sessionId}::uuid AND user_id = ${userId}::uuid
            RETURNING id, title, pinned, updated_at
          `
        : await sql`
            UPDATE app.chat_sessions
            SET pinned = ${pinned!}, updated_at = NOW()
            WHERE id = ${sessionId}::uuid AND user_id = ${userId}::uuid
            RETURNING id, title, pinned, updated_at
          `;

    if (!updated) return tracedError("Session not found", 404);
    return NextResponse.json(updated);
  },
);

// DELETE /api/chat/sessions/:id — delete a session and all its messages
export const DELETE = withErrorHandler(
  async (
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    try {
      const { userId, sessionId } = await authenticateSessionRequest(params);

      if (!(await stopActiveSessionGenerations(sessionId, userId))) {
        return tracedError("Chat generation is still stopping", 409);
      }

      const deleted = await sql`
        WITH owned_session AS MATERIALIZED (
          SELECT id
          FROM app.chat_sessions
          WHERE id = ${sessionId}::uuid AND user_id = ${userId}::uuid
        ),
        deleted_messages AS (
          DELETE FROM app.chat_messages m
          USING owned_session s
          WHERE m.session_id = s.id
        )
        DELETE FROM app.chat_sessions s
        USING owned_session owned
        WHERE s.id = owned.id
        RETURNING s.id
      `;

      if (deleted.length === 0) {
        return tracedError("Session not found", 404);
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        500,
        "Failed to delete session",
        error instanceof Error ? error.message : String(error),
      );
    }
  },
);
