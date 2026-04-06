// chat session management: create/resolve sessions, persist messages

import { generateUUID, isValidUUID } from "@/lib/utils/uuid";
import { Metrics } from "@/lib/metrics";
import sql from "@/database/pgsql.js";
import type { ChatMessage } from "./llm-caller";

export async function persistMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string,
  sources?: { id: string; title: string }[],
): Promise<void> {
  const messageId = generateUUID();
  await sql`
    INSERT INTO app.chat_messages(id, session_id, role, content, sources)
    VALUES(${messageId}::uuid, ${sessionId}::uuid, ${role}, ${content}, ${sources ? JSON.stringify(sources) : null})
  `;
}

// create a new session or verify an existing one belongs to the user
export async function resolveSession(
  userId: string,
  requestedSessionId: string | undefined,
  noteId: string | undefined,
  messageTitle: string,
): Promise<string> {
  if (requestedSessionId && isValidUUID(requestedSessionId)) {
    const rows = await sql`
      SELECT id FROM app.chat_sessions
      WHERE id = ${requestedSessionId}::uuid AND user_id = ${userId}::uuid
    `;
    if (rows.length > 0) {
      await sql`UPDATE app.chat_sessions SET updated_at = NOW() WHERE id = ${requestedSessionId}::uuid`;
      return requestedSessionId;
    }
  }

  const noteIdValue = noteId && isValidUUID(noteId) ? noteId : null;
  const title = messageTitle.slice(0, 60);
  const sessionId = generateUUID();
  await sql`
    INSERT INTO app.chat_sessions(id, user_id, note_id, title)
    VALUES(${sessionId}::uuid, ${userId}::uuid, ${noteIdValue}, ${title})
  `;
  void Metrics.chatSessionCreated();
  return sessionId;
}

/**
 * Load conversation history from DB for an existing session,
 * or fall back to the history sent in the request body.
 */
export async function loadHistory(
  sessionId: string,
  requestedSessionId: string | undefined,
  requestHistory: ChatMessage[],
): Promise<ChatMessage[]> {
  let history = requestHistory.filter((m) => !!m?.content?.trim());

  if (requestedSessionId && isValidUUID(requestedSessionId)) {
    const dbMessages = await sql`
      SELECT role, content FROM app.chat_messages
      WHERE session_id = ${sessionId}::uuid
      ORDER BY created_at
      LIMIT 20
    `;
    history = dbMessages
      .map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }))
      .filter((m: ChatMessage) => !!m.content?.trim());
  }

  return history;
}
