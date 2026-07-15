import sql from "@/database/pgsql.js";
import { redis } from "@/lib/redis";
import { generateUUID } from "@/lib/utils/uuid";

const EVENT_TTL_SECONDS = 60 * 60;
const EVENT_MAX_LENGTH = 4_000;

export interface ChatGenerationPayload {
  userId: string;
  sessionId: string;
  message: string;
  scope: {
    sessionContext: unknown;
    scopedNoteIds: string[] | null;
    scopedInputNoteIds: string[];
    history: { role: "user" | "assistant" | "system"; content: string }[];
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
      ${sql.json(payload)}
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
    UPDATE app.chat_generations
    SET status = 'generating', started_at = COALESCE(started_at, NOW()),
        error_message = NULL, updated_at = NOW()
    WHERE id = ${generationId}::uuid
      AND status IN ('queued', 'generating', 'failed')
    RETURNING id
  `;
  if (rows.length === 0) return false;
  await sql`
    UPDATE app.chat_sessions s
    SET generation_status = 'generating', updated_at = NOW()
    FROM app.chat_generations g
    WHERE g.id = ${generationId}::uuid AND s.id = g.session_id
  `;
  return true;
}

export async function completeChatGeneration(generationId: string): Promise<void> {
  await sql`
    UPDATE app.chat_generations
    SET status = 'completed', completed_at = NOW(), updated_at = NOW()
    WHERE id = ${generationId}::uuid
  `;
}

export async function failChatGeneration(
  generationId: string,
  message: string,
): Promise<void> {
  await sql`
    UPDATE app.chat_generations
    SET status = 'failed', error_message = ${message.slice(0, 1000)}, updated_at = NOW()
    WHERE id = ${generationId}::uuid AND status <> 'completed'
  `;
  await sql`
    UPDATE app.chat_sessions s
    SET generation_status = 'failed', updated_at = NOW()
    FROM app.chat_generations g
    WHERE g.id = ${generationId}::uuid AND s.id = g.session_id
  `;
}

export async function requeueChatGeneration(
  generationId: string,
  message: string,
): Promise<void> {
  await sql`
    UPDATE app.chat_generations
    SET status = 'queued', error_message = ${message.slice(0, 1000)}, updated_at = NOW()
    WHERE id = ${generationId}::uuid AND status <> 'completed'
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
