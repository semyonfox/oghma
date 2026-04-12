// chat session management: create/resolve sessions, persist messages

import { generateUUID, isValidUUID } from "@/lib/utils/uuid";
import { Metrics } from "@/lib/metrics";
import sql from "@/database/pgsql.js";

const MAX_HISTORY_MESSAGES = 20;
const MAX_RECENT_ACCESSES = 12;

export interface ChatSessionContextItem {
  id: string;
  title: string;
}

export interface ChatSessionRecentAccess extends ChatSessionContextItem {
  kind: "search-hit" | "read" | "created";
}

export interface ChatSessionContext {
  scope: {
    notes: ChatSessionContextItem[];
    folders: ChatSessionContextItem[];
  };
  recentAccesses: ChatSessionRecentAccess[];
  lastFolder: ChatSessionContextItem | null;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

function normalizeContextItem(value: unknown): ChatSessionContextItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as { id?: unknown; title?: unknown };
  const id = typeof item.id === "string" ? item.id.trim() : "";
  if (!isValidUUID(id)) return null;
  const title =
    typeof item.title === "string" && item.title.trim()
      ? item.title.trim().slice(0, 200)
      : "Untitled";
  return { id, title };
}

function normalizeContextItems(values: unknown): ChatSessionContextItem[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const items: ChatSessionContextItem[] = [];
  for (const value of values) {
    const item = normalizeContextItem(value);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  return items;
}

export function createEmptyChatSessionContext(): ChatSessionContext {
  return {
    scope: {
      notes: [],
      folders: [],
    },
    recentAccesses: [],
    lastFolder: null,
  };
}

export function normalizeChatSessionContext(
  value: unknown,
): ChatSessionContext {
  if (!value || typeof value !== "object") {
    return createEmptyChatSessionContext();
  }

  const context = value as {
    scope?: { notes?: unknown; folders?: unknown };
    recentAccesses?: unknown;
    lastFolder?: unknown;
  };

  const recentAccesses = Array.isArray(context.recentAccesses)
    ? context.recentAccesses
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const access = entry as {
            id?: unknown;
            title?: unknown;
            kind?: unknown;
          };
          const item = normalizeContextItem(access);
          if (!item) return null;
          const kind =
            access.kind === "search-hit" ||
            access.kind === "read" ||
            access.kind === "created"
              ? access.kind
              : null;
          if (!kind) return null;
          return { ...item, kind } satisfies ChatSessionRecentAccess;
        })
        .filter((entry): entry is ChatSessionRecentAccess => !!entry)
        .slice(0, MAX_RECENT_ACCESSES)
    : [];

  return {
    scope: {
      notes: normalizeContextItems(context.scope?.notes),
      folders: normalizeContextItems(context.scope?.folders),
    },
    recentAccesses,
    lastFolder: normalizeContextItem(context.lastFolder),
  };
}

export async function loadSessionContext(
  sessionId: string,
): Promise<ChatSessionContext> {
  const rows = await sql`
    SELECT context
    FROM app.chat_sessions
    WHERE id = ${sessionId}::uuid
    LIMIT 1
  `;

  return normalizeChatSessionContext(rows[0]?.context);
}

async function saveSessionContext(
  sessionId: string,
  context: ChatSessionContext,
): Promise<void> {
  await sql`
    UPDATE app.chat_sessions
    SET context = ${JSON.stringify(context)}::jsonb,
        updated_at = NOW()
    WHERE id = ${sessionId}::uuid
  `;
}

export async function updateSessionContext(
  sessionId: string,
  updater: (context: ChatSessionContext) => ChatSessionContext,
): Promise<ChatSessionContext> {
  const current = await loadSessionContext(sessionId);
  const next = normalizeChatSessionContext(updater(current));
  await saveSessionContext(sessionId, next);
  return next;
}

export async function setSessionScope(
  sessionId: string,
  notes: ChatSessionContextItem[],
  folders: ChatSessionContextItem[],
): Promise<ChatSessionContext> {
  return updateSessionContext(sessionId, (context) => ({
    ...context,
    scope: {
      notes: normalizeContextItems(notes),
      folders: normalizeContextItems(folders),
    },
  }));
}

export async function recordSessionAccesses(
  sessionId: string,
  accesses: ChatSessionRecentAccess[],
): Promise<ChatSessionContext> {
  return updateSessionContext(sessionId, (context) => {
    if (accesses.length === 0) return context;

    const merged = [...accesses, ...context.recentAccesses];
    const seen = new Set<string>();
    const recentAccesses: ChatSessionRecentAccess[] = [];

    for (const access of merged) {
      const normalized = normalizeContextItem(access);
      if (!normalized) continue;
      const kind = access.kind;
      if (kind !== "search-hit" && kind !== "read" && kind !== "created") {
        continue;
      }

      const key = `${normalized.id}:${kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      recentAccesses.push({ ...normalized, kind });
      if (recentAccesses.length >= MAX_RECENT_ACCESSES) break;
    }

    return {
      ...context,
      recentAccesses,
    };
  });
}

export async function recordSessionCreatedNote(
  sessionId: string,
  note: ChatSessionContextItem,
  folder?: ChatSessionContextItem | null,
): Promise<ChatSessionContext> {
  return updateSessionContext(sessionId, (context) => {
    const normalizedNote = normalizeContextItem(note);
    const recentAccesses: ChatSessionRecentAccess[] = [
      ...(normalizedNote
        ? [{ ...normalizedNote, kind: "created" as const }]
        : []),
      ...context.recentAccesses,
    ].slice(0, MAX_RECENT_ACCESSES);

    return {
      ...context,
      recentAccesses,
      lastFolder: folder ? normalizeContextItem(folder) : context.lastFolder,
    };
  });
}

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
      await sql`UPDATE app.chat_sessions SET updated_at = NOW() WHERE id = ${requestedSessionId}::uuid AND user_id = ${userId}::uuid`;
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
  let history = requestHistory
    .filter((m) => !!m?.content?.trim())
    .slice(-MAX_HISTORY_MESSAGES);

  if (requestedSessionId && isValidUUID(requestedSessionId)) {
    const dbMessages = await sql`
      SELECT role, content FROM app.chat_messages
      WHERE session_id = ${sessionId}::uuid
      ORDER BY created_at
      LIMIT ${MAX_HISTORY_MESSAGES}
    `;
    history = dbMessages
      .map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }))
      .filter((m: ChatMessage) => !!m.content?.trim())
      .slice(-MAX_HISTORY_MESSAGES);
  }

  return history;
}
