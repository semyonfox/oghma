import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { isValidUUID } from "@/lib/utils/uuid";
import { withErrorHandler, tracedError } from "@/lib/api-error";
import { normalizeChatSessionContext } from "@/lib/chat/session";
import sql from "@/database/pgsql.js";
import logger from "@/lib/logger";
import {
  loadOwnedChatGeneration,
  requestChatGenerationCancel,
} from "@/lib/chat/generation-store";

const GENERATION_STOP_TIMEOUT_MS = 6_000;
const GENERATION_STOP_POLL_MS = 100;

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

async function stopActiveSessionGenerations(
  sessionId: string,
  userId: string,
): Promise<boolean> {
  const active = await sql`
    SELECT id
    FROM app.chat_generations
    WHERE session_id = ${sessionId}::uuid
      AND user_id = ${userId}::uuid
      AND status IN ('queued', 'generating')
  `;
  const generationIds = active.map((row: { id: string }) => row.id);
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
      const auth = await authenticate(params);
      if ("error" in auth) return auth.error;
      const { user, id } = auth;

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
            WHERE s.id = ${id}::uuid AND s.user_id = ${user.user_id}::uuid
        `;
      if (sessions.length === 0) {
        return tracedError("Session not found", 404);
      }

      const messages = await sql`
            SELECT m.id, m.role, m.content, m.parts, m.sources, m.metadata, m.created_at
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

// PATCH /api/chat/sessions/:id — rename or pin a session
export const PATCH = withErrorHandler(
  async (
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const auth = await authenticate(params);
    if ("error" in auth) return auth.error;
    const { user, id } = auth;
    const body = await req.json();
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
          WHERE id = ${id}::uuid AND user_id = ${user.user_id}::uuid
          RETURNING id, title, pinned, updated_at
        `
      : title !== undefined
        ? await sql`
            UPDATE app.chat_sessions
            SET title = ${title}, updated_at = NOW()
            WHERE id = ${id}::uuid AND user_id = ${user.user_id}::uuid
            RETURNING id, title, pinned, updated_at
          `
        : await sql`
            UPDATE app.chat_sessions
            SET pinned = ${pinned!}, updated_at = NOW()
            WHERE id = ${id}::uuid AND user_id = ${user.user_id}::uuid
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
      const auth = await authenticate(params);
      if ("error" in auth) return auth.error;
      const { user, id } = auth;

      if (!(await stopActiveSessionGenerations(id, user.user_id))) {
        return tracedError("Chat generation is still stopping", 409);
      }

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
