// Queue facade for canvas-import + extract-retry pipelines.
// Defaults to BullMQ for local/current homelab compatibility. Set
// QUEUE_PROVIDER=cloudflare to publish to Cloudflare Queues over HTTP.
import { Queue, type JobsOptions } from "bullmq";
import IORedis from "ioredis";

export type QueueProvider = "bullmq" | "cloudflare";

interface CloudflareQueueMessage {
  body: Record<string, unknown>;
  content_type?: "json";
  delay_seconds?: number;
}

interface CloudflareQueueConfig {
  accountId: string;
  apiToken: string;
  canvasQueueId: string;
  extractRetryQueueId: string;
}

let _connection: IORedis | null = null;

function getConnection(): IORedis {
  if (_connection) return _connection;
  _connection = new IORedis({
    host: process.env.REDIS_HOST ?? "localhost",
    port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
    maxRetriesPerRequest: null,
  });
  return _connection;
}

const BASE_CANVAS_IMPORT_QUEUE = "canvas-import";
const BASE_EXTRACT_RETRY_QUEUE = "extract-retry";

function sanitizeQueuePrefix(value: string | undefined): string | null {
  const sanitized = value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized || null;
}

function queuePrefixFromUrl(value: string | undefined): string | null {
  if (!value) return null;

  try {
    return sanitizeQueuePrefix(new URL(value).hostname);
  } catch {
    return sanitizeQueuePrefix(value);
  }
}

export function getQueuePrefix(): string {
  return (
    sanitizeQueuePrefix(process.env.QUEUE_PREFIX) ??
    sanitizeQueuePrefix(process.env.BULLMQ_QUEUE_PREFIX) ??
    sanitizeQueuePrefix(process.env.DEPLOY_ENV) ??
    queuePrefixFromUrl(
      process.env.NEXT_PUBLIC_APP_URL ??
        process.env.APP_BASE_URL ??
        process.env.NEXTAUTH_URL,
    ) ??
    sanitizeQueuePrefix(process.env.STORAGE_PREFIX) ??
    sanitizeQueuePrefix(process.env.NODE_ENV) ??
    "local"
  );
}

function prefixedQueueName(baseName: string): string {
  return `${getQueuePrefix()}-${baseName}`;
}

export const CANVAS_IMPORT_QUEUE = prefixedQueueName(BASE_CANVAS_IMPORT_QUEUE);
export const EXTRACT_RETRY_QUEUE = prefixedQueueName(BASE_EXTRACT_RETRY_QUEUE);

export function getQueueProvider(): QueueProvider {
  const provider = process.env.QUEUE_PROVIDER?.toLowerCase();
  if (!provider || provider === "bullmq") return "bullmq";
  if (provider === "cloudflare" || provider === "cf") return "cloudflare";
  throw new Error(`Unsupported QUEUE_PROVIDER: ${process.env.QUEUE_PROVIDER}`);
}

let _canvasImportQueue: Queue | null = null;
let _extractRetryQueue: Queue | null = null;

export function getCanvasImportQueue(): Queue {
  if (_canvasImportQueue) return _canvasImportQueue;
  _canvasImportQueue = new Queue(CANVAS_IMPORT_QUEUE, {
    connection: getConnection(),
  });
  return _canvasImportQueue;
}

export function getExtractRetryQueue(): Queue {
  if (_extractRetryQueue) return _extractRetryQueue;
  _extractRetryQueue = new Queue(EXTRACT_RETRY_QUEUE, {
    connection: getConnection(),
  });
  return _extractRetryQueue;
}

// `attempts: 3` is safe for canvas-import (workers check terminal states before
// mutating; see src/lib/canvas/import-extraction.js) and extract-retry.
// Vault import is NOT yet retry-safe: `createNote()` mints fresh UUIDs per entry,
// so a partial-failure retry would create duplicates. Vault enqueue sites override
// attempts: 1 until import-worker is made idempotent (planned alongside cancellation).
// keep the last 200 completed/failed jobs for observability; older are pruned
const DEFAULT_OPTS: JobsOptions = {
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 200 },
  attempts: 3,
  backoff: { type: "exponential", delay: 1000 },
};

function getCloudflareQueueConfig(): CloudflareQueueConfig {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? process.env.CF_ACCOUNT_ID;
  const apiToken =
    process.env.CLOUDFLARE_QUEUES_API_TOKEN ??
    process.env.CLOUDFLARE_QUEUE_API_TOKEN ??
    process.env.CF_QUEUES_API_TOKEN;
  const canvasQueueId = process.env.CLOUDFLARE_CANVAS_IMPORT_QUEUE_ID;
  const extractRetryQueueId = process.env.CLOUDFLARE_EXTRACT_RETRY_QUEUE_ID;

  const missing = [
    ["CLOUDFLARE_ACCOUNT_ID", accountId],
    ["CLOUDFLARE_QUEUES_API_TOKEN", apiToken],
    ["CLOUDFLARE_CANVAS_IMPORT_QUEUE_ID", canvasQueueId],
    ["CLOUDFLARE_EXTRACT_RETRY_QUEUE_ID", extractRetryQueueId],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `Missing Cloudflare Queues configuration for QUEUE_PROVIDER=cloudflare: ${missing.join(", ")}`,
    );
  }

  return {
    accountId: accountId!,
    apiToken: apiToken!,
    canvasQueueId: canvasQueueId!,
    extractRetryQueueId: extractRetryQueueId!,
  };
}

function getCloudflareQueueId(queueName: string): string {
  const config = getCloudflareQueueConfig();
  switch (queueName) {
    case CANVAS_IMPORT_QUEUE:
      return config.canvasQueueId;
    case EXTRACT_RETRY_QUEUE:
      return config.extractRetryQueueId;
    default:
      throw new Error(`Unknown Cloudflare queue name: ${queueName}`);
  }
}

function cloudflareQueueUrl(queueId: string, action?: "messages" | "pull" | "ack"): string {
  const { accountId } = getCloudflareQueueConfig();
  const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/queues/${queueId}/messages`;
  return action && action !== "messages" ? `${base}/${action}` : base;
}

async function cloudflareQueueRequest<T>(
  queueId: string,
  action: "messages" | "pull" | "ack",
  body: unknown,
): Promise<T> {
  const { apiToken } = getCloudflareQueueConfig();
  const response = await fetch(cloudflareQueueUrl(queueId, action), {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok || payload.success === false) {
    const message =
      payload.errors?.map((err: { message?: string }) => err.message).filter(Boolean).join("; ") ||
      payload.message ||
      response.statusText;
    throw new Error(`Cloudflare Queues request failed (${response.status}): ${message}`);
  }

  return payload as T;
}

async function sendCloudflareQueueMessage(
  queueName: string,
  message: CloudflareQueueMessage,
): Promise<void> {
  await cloudflareQueueRequest(getCloudflareQueueId(queueName), "messages", message);
}

function delayMillisToSeconds(delay?: number): number | undefined {
  if (!delay || delay <= 0) return undefined;
  return Math.ceil(delay / 1000);
}

export async function enqueueCanvasJob(
  type: string,
  data: Record<string, unknown>,
  opts: JobsOptions = {},
): Promise<void> {
  if (getQueueProvider() === "cloudflare") {
    await sendCloudflareQueueMessage(CANVAS_IMPORT_QUEUE, {
      body: { type, ...data },
      content_type: "json",
      delay_seconds: delayMillisToSeconds(opts.delay),
    });
    return;
  }

  await getCanvasImportQueue().add(type, { type, ...data }, { ...DEFAULT_OPTS, ...opts });
}

export async function enqueueCanvasJobBatch(
  type: string,
  payloads: Record<string, unknown>[],
): Promise<void> {
  if (payloads.length === 0) return;
  if (getQueueProvider() === "cloudflare") {
    await Promise.all(
      payloads.map((data) =>
        sendCloudflareQueueMessage(CANVAS_IMPORT_QUEUE, {
          body: { type, ...data },
          content_type: "json",
        }),
      ),
    );
    return;
  }

  await getCanvasImportQueue().addBulk(
    payloads.map((data) => ({
      name: type,
      data: { type, ...data },
      opts: DEFAULT_OPTS,
    })),
  );
}

export async function enqueueExtractRetryJob(
  data: Record<string, unknown>,
  delaySeconds: number,
): Promise<void> {
  if (getQueueProvider() === "cloudflare") {
    await sendCloudflareQueueMessage(EXTRACT_RETRY_QUEUE, {
      body: { type: "extract-retry", ...data },
      content_type: "json",
      delay_seconds: delaySeconds,
    });
    return;
  }

  await getExtractRetryQueue().add(
    "extract-retry",
    { type: "extract-retry", ...data },
    { ...DEFAULT_OPTS, delay: delaySeconds * 1000 },
  );
}

export function getQueueConnection(): IORedis {
  return getConnection();
}

export interface CloudflarePulledMessage {
  id: string;
  lease_id: string;
  attempts: number;
  body: unknown;
  metadata?: Record<string, string>;
}

export interface CloudflarePullResult {
  messages: CloudflarePulledMessage[];
}

export async function pullCloudflareQueueMessages(
  queueName: string,
  options: { batchSize?: number; visibilityTimeoutMs?: number } = {},
): Promise<CloudflarePullResult> {
  const queueId = getCloudflareQueueId(queueName);
  const payload = await cloudflareQueueRequest<{
    result?: { messages?: CloudflarePulledMessage[] };
  }>(queueId, "pull", {
    batch_size: options.batchSize ?? 10,
    visibility_timeout_ms: options.visibilityTimeoutMs ?? 3_600_000,
  });

  return { messages: payload.result?.messages ?? [] };
}

export async function ackCloudflareQueueMessages(
  queueName: string,
  acks: string[],
  retries: { lease_id: string; delay_seconds?: number }[] = [],
): Promise<void> {
  const queueId = getCloudflareQueueId(queueName);
  await cloudflareQueueRequest(queueId, "ack", {
    acks: acks.map((lease_id) => ({ lease_id })),
    retries,
  });
}

export function parseCloudflareQueueBody(message: CloudflarePulledMessage): Record<string, unknown> {
  if (message.body && typeof message.body === "object" && !Array.isArray(message.body)) {
    return message.body as Record<string, unknown>;
  }

  if (typeof message.body !== "string") {
    throw new Error(`Unsupported Cloudflare queue body type for message ${message.id}`);
  }

  const contentType = message.metadata?.["CF-Content-Type"] ?? message.metadata?.["content-type"];
  if (contentType === "json" || contentType === "bytes") {
    try {
      return JSON.parse(message.body);
    } catch {
      const decoded = Buffer.from(message.body, "base64").toString("utf8");
      return JSON.parse(decoded);
    }
  }

  return JSON.parse(message.body);
}
