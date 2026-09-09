import sql from "@/database/pgsql";
import { redis, type RedisConnection } from "@/lib/redis";
import { generateUUID } from "@/lib/utils/uuid";
import type { ChatMessage, ChatSessionContext } from "@/lib/chat/session";
import type { MessageMetadata, MessagePart } from "@/lib/chat/types";

const EVENT_TTL_SECONDS = 60 * 60;
const EVENT_MAX_LENGTH = 4_000;
const CANCEL_FLAG_TTL_SECONDS = 60 * 60;
export const CHAT_GENERATION_LEASE_MS = 45_000;
const CHAT_GENERATION_QUEUED_RECOVERY_MS = 5 * 60_000;

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
  request_payload: ChatGenerationPayload | null;
  error_message: string | null;
  lease_token: string | null;
  lease_expires_at: Date | string | null;
}

export interface ChatGenerationClaim {
  generation: ChatGenerationRecord;
  leaseToken: string;
}

export interface ChatGenerationAssistantOutput {
  content: string;
  parts: MessagePart[];
  sources?: { id: string; title: string }[];
  metadata?: MessageMetadata;
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
  const userMessageId = generateUUID();
  await sql`
    WITH user_message AS (
      INSERT INTO app.chat_messages(
        id, session_id, role, content, parts, sources, metadata
      )
      VALUES(
        ${userMessageId}::uuid,
        ${payload.sessionId}::uuid,
        'user',
        ${payload.message},
        ${JSON.stringify([{ type: "text", text: payload.message }])}::jsonb,
        NULL,
        '{}'::jsonb
      )
    ), generation AS (
      INSERT INTO app.chat_generations(
        id, session_id, user_id, status, request_payload
      )
      VALUES(
        ${generationId}::uuid,
        ${payload.sessionId}::uuid,
        ${payload.userId}::uuid,
        'queued',
        ${JSON.stringify(payload)}::jsonb
      )
    )
    UPDATE app.chat_sessions
    SET generation_status = 'generating', updated_at = NOW()
    WHERE id = ${payload.sessionId}::uuid
  `;
  return generationId;
}

export async function loadChatGeneration(
  generationId: string,
): Promise<ChatGenerationRecord | null> {
  const rows = await sql`
    SELECT id, session_id, user_id, status, request_payload, error_message,
           lease_token, lease_expires_at
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
    SELECT id, session_id, user_id, status, request_payload, error_message,
           lease_token, lease_expires_at
    FROM app.chat_generations
    WHERE id = ${generationId}::uuid AND user_id = ${userId}::uuid
    LIMIT 1
  `;
  return normalizeGenerationRecord(rows[0] as ChatGenerationRecord | undefined);
}

export async function claimChatGeneration(
  generationId: string,
): Promise<ChatGenerationClaim | null> {
  const leaseToken = generateUUID();
  const rows = await sql`
    WITH claimed AS (
      UPDATE app.chat_generations
      SET status = 'generating', started_at = COALESCE(started_at, NOW()),
          error_message = NULL, lease_token = ${leaseToken}::uuid,
          heartbeat_at = NOW(),
          lease_expires_at = NOW() + ${CHAT_GENERATION_LEASE_MS} * INTERVAL '1 millisecond',
          updated_at = NOW()
      WHERE id = ${generationId}::uuid
        AND (
          status = 'queued'
          OR (
            status = 'generating'
            AND (
              lease_expires_at <= NOW()
              OR (lease_expires_at IS NULL AND updated_at <= NOW() - ${CHAT_GENERATION_LEASE_MS} * INTERVAL '1 millisecond')
            )
          )
        )
      RETURNING id, session_id, user_id, status, request_payload,
                error_message, lease_token, lease_expires_at
    ), session_updated AS (
      UPDATE app.chat_sessions s
      SET generation_status = 'generating', updated_at = NOW()
      FROM claimed
      WHERE s.id = claimed.session_id
    )
    SELECT * FROM claimed
  `;
  const generation = normalizeGenerationRecord(
    rows[0] as ChatGenerationRecord | undefined,
  );
  return generation ? { generation, leaseToken } : null;
}

export async function heartbeatChatGeneration(
  generationId: string,
  leaseToken: string,
): Promise<boolean> {
  const rows = await sql`
    UPDATE app.chat_generations
    SET heartbeat_at = NOW(),
        lease_expires_at = NOW() + ${CHAT_GENERATION_LEASE_MS} * INTERVAL '1 millisecond',
        updated_at = NOW()
    WHERE id = ${generationId}::uuid
      AND status = 'generating'
      AND lease_token = ${leaseToken}::uuid
      AND lease_expires_at > NOW()
    RETURNING id
  `;
  return rows.length > 0;
}

/**
 * Insert the assistant output and settle its generation/session in one
 * statement. The unique generation_id makes a replay idempotent, while the
 * live lease token fences a worker that continued after its lease expired.
 */
export async function finalizeChatGeneration(
  generationId: string,
  leaseToken: string,
  status: "completed" | "cancelled",
  output: ChatGenerationAssistantOutput | null,
): Promise<boolean> {
  const messageId = generateUUID();
  const rows = await sql`
    WITH owned AS MATERIALIZED (
      SELECT id, session_id
      FROM app.chat_generations
      WHERE id = ${generationId}::uuid
        AND status = 'generating'
        AND lease_token = ${leaseToken}::uuid
        AND lease_expires_at > NOW()
      FOR UPDATE
    ), inserted_message AS (
      INSERT INTO app.chat_messages(
        id, session_id, role, content, parts, sources, metadata, generation_id
      )
      SELECT
        ${messageId}::uuid,
        owned.session_id,
        'assistant',
        ${output?.content ?? ""},
        ${JSON.stringify(output?.parts ?? [])}::jsonb,
        ${output?.sources ? JSON.stringify(output.sources) : null}::jsonb,
        ${JSON.stringify(output?.metadata ?? {})}::jsonb,
        owned.id
      FROM owned
      WHERE ${output !== null}
      ON CONFLICT (generation_id) DO NOTHING
      RETURNING id
    ), settled AS (
      UPDATE app.chat_generations generation
      SET status = ${status}, completed_at = NOW(), error_message = NULL,
          lease_token = NULL, lease_expires_at = NULL, heartbeat_at = NULL,
          updated_at = NOW()
      FROM owned
      WHERE generation.id = owned.id
        AND (
          ${output === null}
          OR EXISTS (SELECT 1 FROM inserted_message)
          OR EXISTS (
            SELECT 1 FROM app.chat_messages message
            WHERE message.generation_id = owned.id
          )
        )
      RETURNING generation.session_id
    )
    UPDATE app.chat_sessions session
    SET generation_status = CASE
          WHEN EXISTS (
            SELECT 1
            FROM app.chat_generations active
            WHERE active.session_id = session.id
              AND active.id <> ${generationId}::uuid
              AND active.status IN ('queued', 'generating')
          ) THEN 'generating'
          ELSE 'idle'
        END,
        updated_at = NOW()
    FROM settled
    WHERE session.id = settled.session_id
    RETURNING session.id
  `;
  return rows.length > 0;
}

export async function failChatGeneration(
  generationId: string,
  message: string,
  leaseToken?: string,
): Promise<boolean> {
  const rows = await sql`
    WITH failed AS (
      UPDATE app.chat_generations
      SET status = 'failed', completed_at = NOW(), error_message = ${message.slice(0, 1000)},
          lease_token = NULL, lease_expires_at = NULL, heartbeat_at = NULL,
          updated_at = NOW()
      WHERE id = ${generationId}::uuid
        AND (
          (${leaseToken ?? null}::uuid IS NULL AND status = 'queued')
          OR (
            status = 'generating'
            AND lease_token = ${leaseToken ?? null}::uuid
            AND lease_expires_at > NOW()
          )
        )
      RETURNING session_id
    )
    UPDATE app.chat_sessions s
    SET generation_status = CASE
          WHEN EXISTS (
            SELECT 1
            FROM app.chat_generations active
            WHERE active.session_id = s.id
              AND active.id <> ${generationId}::uuid
              AND active.status IN ('queued', 'generating')
          ) THEN 'generating'
          ELSE 'failed'
        END,
        updated_at = NOW()
    FROM failed
    WHERE s.id = failed.session_id
    RETURNING s.id
  `;
  return rows.length > 0;
}

/**
 * Cancel an unclaimed generation, or fence a worker cancellation with its
 * lease. Workers with partial output use finalizeChatGeneration instead.
 */
export async function cancelChatGeneration(
  generationId: string,
  leaseToken?: string,
): Promise<boolean> {
  const rows = await sql`
    WITH cancelled AS (
      UPDATE app.chat_generations
      SET status = 'cancelled', completed_at = NOW(),
          lease_token = NULL, lease_expires_at = NULL, heartbeat_at = NULL,
          updated_at = NOW()
      WHERE id = ${generationId}::uuid
        AND (
          (${leaseToken ?? null}::uuid IS NULL AND status IN ('queued', 'failed'))
          OR (
            status = 'generating'
            AND lease_token = ${leaseToken ?? null}::uuid
            AND lease_expires_at > NOW()
          )
        )
      RETURNING session_id
    )
    UPDATE app.chat_sessions s
    SET generation_status = CASE
          WHEN EXISTS (
            SELECT 1
            FROM app.chat_generations active
            WHERE active.session_id = s.id
              AND active.id <> ${generationId}::uuid
              AND active.status IN ('queued', 'generating')
          ) THEN 'generating'
          ELSE 'idle'
        END,
        updated_at = NOW()
    FROM cancelled
    WHERE s.id = cancelled.session_id
    RETURNING s.id
  `;
  return rows.length > 0;
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
  leaseToken: string,
): Promise<boolean> {
  const rows = await sql`
    UPDATE app.chat_generations
    SET status = 'queued', error_message = ${message.slice(0, 1000)},
        lease_token = NULL, lease_expires_at = NULL, heartbeat_at = NULL,
        updated_at = NOW()
    WHERE id = ${generationId}::uuid
      AND status = 'generating'
      AND lease_token = ${leaseToken}::uuid
      AND lease_expires_at > NOW()
    RETURNING id
  `;
  return rows.length > 0;
}

/**
 * Release expired work and old queued rows for republication. Updating
 * updated_at rate-limits duplicate publications across worker replicas; the
 * lease claim remains the final concurrency guard.
 */
export async function recoverStaleChatGenerations(
  limit = 100,
): Promise<string[]> {
  const rows = await sql<Array<{ id: string }>>`
    WITH candidates AS (
      SELECT id
      FROM app.chat_generations
      WHERE (
          status = 'generating'
          AND (
            lease_expires_at <= NOW()
            OR (lease_expires_at IS NULL AND updated_at <= NOW() - ${CHAT_GENERATION_LEASE_MS} * INTERVAL '1 millisecond')
          )
        )
        OR (
          status = 'queued'
          AND updated_at <= NOW() - ${CHAT_GENERATION_QUEUED_RECOVERY_MS} * INTERVAL '1 millisecond'
        )
      ORDER BY updated_at
      LIMIT ${Math.max(1, limit)}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE app.chat_generations generation
    SET status = 'queued', lease_token = NULL, lease_expires_at = NULL,
        heartbeat_at = NULL, updated_at = NOW(),
        error_message = CASE
          WHEN generation.status = 'generating' THEN 'Worker lease expired; queued for recovery'
          ELSE generation.error_message
        END
    FROM candidates
    WHERE generation.id = candidates.id
    RETURNING generation.id
  `;
  return rows.map((row) => row.id);
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

type RedisStreamReader = Pick<RedisConnection, "call">;

function parseRedisEvents(
  result: unknown,
): StoredChatEvent[] {
  if (!Array.isArray(result)) return [];

  // ioredis applies the XREAD reply transformer even through `.call()`, so
  // one stream arrives as [streamKey, entries], not [[streamKey, entries]].
  // Keep the nested shape too for compatibility with raw Redis replies.
  const streams: unknown[] =
    typeof result[0] === "string" && Array.isArray(result[1])
      ? [result]
      : result;

  return streams.flatMap((stream) => {
    if (!Array.isArray(stream) || !Array.isArray(stream[1])) return [];
    return stream[1].flatMap((entry: unknown) => {
      if (
        !Array.isArray(entry) ||
        typeof entry[0] !== "string" ||
        !Array.isArray(entry[1])
      ) {
        return [];
      }
      const fields = entry[1];
      const index = fields.indexOf("sse");
      const sse = index >= 0 ? fields[index + 1] : undefined;
      return typeof sse === "string" ? [{ id: entry[0], sse }] : [];
    });
  });
}

export async function readChatGenerationEvents(
  generationId: string,
  afterId: string,
  blockMs = 15_000,
  reader: RedisStreamReader = redis,
): Promise<StoredChatEvent[]> {
  const result = await reader.call(
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

/** Clear terminal replay inputs after seven days; retain messages and status. */
export async function pruneChatGenerationPayloads(): Promise<number> {
  const rows = await sql`
    WITH expired AS (
      SELECT id FROM app.chat_generations
      WHERE status IN ('completed', 'failed', 'cancelled')
        AND request_payload IS NOT NULL
        AND updated_at < NOW() - INTERVAL '7 days'
      ORDER BY updated_at, id LIMIT 500
      FOR UPDATE SKIP LOCKED
    )
    UPDATE app.chat_generations g SET request_payload = NULL
    FROM expired WHERE g.id = expired.id RETURNING g.id
  `;
  return rows.length;
}
