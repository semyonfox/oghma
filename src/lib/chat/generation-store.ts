import sql from "@/database/pgsql";
import { redis } from "@/lib/redis";
import { generateUUID } from "@/lib/utils/uuid";
import type { ChatMessage, ChatSessionContext } from "@/lib/chat/session";

const EVENT_TTL_SECONDS = 60 * 60;
const EVENT_MAX_LENGTH = 4_000;
const CANCEL_FLAG_TTL_SECONDS = 60 * 60;

export interface ChatGenerationPayload {
  userId: string;
  sessionId: string;
  message: string;
  scope: {
    sessionContext: ChatSessionContext;
    scopedNoteIds: string[] | null;
    scopedInputNoteIds: string[];
    history: ChatMessage[];
  };
  useRag: boolean;
  thinkingMode: "auto" | "off";
  clientDateTime?: string;
  requestOrigin: string;
  referer?: string;
  respectPrivacySignal: boolean;
}

export interface ChatGenerationRecord {
  id: string;
  session_id: string;
  user_id: string;
  status: "queued" | "generating" | "completed" | "failed" | "cancelled";
  request_payload: ChatGenerationPayload;
  error_message: string | null;
}

function normalizeGenerationRecord(
  row: ChatGenerationRecord | undefined,
): ChatGenerationRecord | null {
  if (!row) return null;
  if (typeof row.request_payload !== "string") return row;

  return {
    ...row,
    request_payload: JSON.parse(row.request_payload) as ChatGenerationPayload,
  };
}

function eventKey(generationId: string): string {
  return `chat-generation:${generationId}:events`;
}

function cancelKey(generationId: string): string {
  return `chat-generation:${generationId}:cancel`;
}

export async function createChatGeneration(
  payload: ChatGenerationPayload,
): Promise<string> {
  const generationId = generateUUID();
  await sql`
    INSERT INTO app.chat_generations(id, session_id, user_id, status, request_payload)
    VALUES(
      ${generationId}::uuid,
      ${payload.sessionId}::uuid,
      ${payload.userId}::uuid,
      'queued',
      ${JSON.stringify(payload)}::jsonb
    )
  `;
  return generationId;
}

export async function loadChatGeneration(
  generationId: string,
): Promise<ChatGenerationRecord | null> {
  const rows = await sql`
    SELECT id, session_id, user_id, status, request_payload, error_message
    FROM app.chat_generations
    WHERE id = ${generationId}::uuid
    LIMIT 1
  `;
  return normalizeGenerationRecord(rows[0] as ChatGenerationRecord | undefined);
}

export async function loadOwnedChatGeneration(
  generationId: string,
  userId: string,
): Promise<ChatGenerationRecord | null> {
  const rows = await sql`
    SELECT id, session_id, user_id, status, request_payload, error_message
    FROM app.chat_generations
    WHERE id = ${generationId}::uuid AND user_id = ${userId}::uuid
    LIMIT 1
  `;
  return normalizeGenerationRecord(rows[0] as ChatGenerationRecord | undefined);
}

export async function claimChatGeneration(generationId: string): Promise<boolean> {
  const rows = await sql`
    WITH claimed AS (
      UPDATE app.chat_generations
      SET status = 'generating', started_at = COALESCE(started_at, NOW()),
          error_message = NULL, updated_at = NOW()
      WHERE id = ${generationId}::uuid
        AND status IN ('queued', 'failed')
      RETURNING id, session_id
    )
    UPDATE app.chat_sessions s
    SET generation_status = 'generating', updated_at = NOW()
    FROM claimed
    WHERE s.id = claimed.session_id
    RETURNING claimed.id
  `;
  return rows.length > 0;
}

export async function completeChatGeneration(generationId: string): Promise<void> {
  await sql`
    WITH completed AS (
      UPDATE app.chat_generations
      SET status = 'completed', completed_at = NOW(), updated_at = NOW()
      WHERE id = ${generationId}::uuid
        AND status = 'generating'
      RETURNING session_id
    )
    UPDATE app.chat_sessions s
    SET generation_status = 'idle', updated_at = NOW()
    FROM completed
    WHERE s.id = completed.session_id
  `;
}

export async function failChatGeneration(
  generationId: string,
  message: string,
): Promise<void> {
  await sql`
    WITH failed AS (
      UPDATE app.chat_generations
      SET status = 'failed', error_message = ${message.slice(0, 1000)}, updated_at = NOW()
      WHERE id = ${generationId}::uuid
        AND status IN ('queued', 'generating')
      RETURNING session_id
    )
    UPDATE app.chat_sessions s
    SET generation_status = 'failed', updated_at = NOW()
    FROM failed
    WHERE s.id = failed.session_id
  `;
}

/**
 * Terminal cancel: the worker aborted (user stop or disconnect) or the
 * generation was cancelled before it started. Any partial assistant message
 * has already been persisted, so the session returns to plain 'idle'.
 */
export async function cancelChatGeneration(generationId: string): Promise<void> {
  await sql`
    WITH cancelled AS (
      UPDATE app.chat_generations
      SET status = 'cancelled', completed_at = NOW(), updated_at = NOW()
      WHERE id = ${generationId}::uuid AND status <> 'completed'
      RETURNING session_id
    )
    UPDATE app.chat_sessions s
    SET generation_status = 'idle', updated_at = NOW()
    FROM cancelled
    WHERE s.id = cancelled.session_id
  `;
}

/** Ask an in-flight worker to abort. Observed by the generation watchdog. */
export async function requestChatGenerationCancel(
  generationId: string,
): Promise<void> {
  await redis.set(cancelKey(generationId), "1", "EX", CANCEL_FLAG_TTL_SECONDS);
}

export async function isChatGenerationCancelRequested(
  generationId: string,
): Promise<boolean> {
  return (await redis.exists(cancelKey(generationId))) === 1;
}

export async function requeueChatGeneration(
  generationId: string,
  message: string,
): Promise<void> {
  await sql`
    UPDATE app.chat_generations
    SET status = 'queued', error_message = ${message.slice(0, 1000)}, updated_at = NOW()
    WHERE id = ${generationId}::uuid AND status = 'generating'
  `;
}

export async function resetChatGenerationEvents(generationId: string): Promise<void> {
  await redis.del(eventKey(generationId));
}

export async function appendChatGenerationEvent(
  generationId: string,
  sse: string,
): Promise<string> {
  const key = eventKey(generationId);
  const id = await redis.xadd(
    key,
    "MAXLEN",
    "~",
    EVENT_MAX_LENGTH,
    "*",
    "sse",
    sse,
  );
  await redis.expire(key, EVENT_TTL_SECONDS);
  if (!id) throw new Error("Redis did not return a chat event id");
  return id;
}

export interface StoredChatEvent {
  id: string;
  sse: string;
}

function parseRedisEvents(
  result: unknown,
): StoredChatEvent[] {
  if (!Array.isArray(result)) return [];
  const stream = result[0];
  if (!Array.isArray(stream) || !Array.isArray(stream[1])) return [];
  return stream[1].flatMap((entry: unknown) => {
    if (!Array.isArray(entry) || typeof entry[0] !== "string" || !Array.isArray(entry[1])) {
      return [];
    }
    const fields = entry[1];
    const index = fields.indexOf("sse");
    const sse = index >= 0 ? fields[index + 1] : undefined;
    return typeof sse === "string" ? [{ id: entry[0], sse }] : [];
  });
}

export async function readChatGenerationEvents(
  generationId: string,
  afterId: string,
  blockMs = 15_000,
): Promise<StoredChatEvent[]> {
  const result = await redis.call(
    "XREAD",
    "BLOCK",
    String(blockMs),
    "COUNT",
    "200",
    "STREAMS",
    eventKey(generationId),
    afterId,
  );
  return parseRedisEvents(result);
}
