// BullMQ queues — replaces SQS for canvas-import + extract-retry pipelines
// connection: REDIS_HOST/REDIS_PORT (defaults to localhost:6379)
import { Queue, type JobsOptions } from "bullmq";
import IORedis from "ioredis";

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

export const CANVAS_IMPORT_QUEUE = "canvas-import";
export const EXTRACT_RETRY_QUEUE = "extract-retry";

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

export async function enqueueCanvasJob(
  type: string,
  data: Record<string, unknown>,
  opts: JobsOptions = {},
): Promise<void> {
  await getCanvasImportQueue().add(type, { type, ...data }, { ...DEFAULT_OPTS, ...opts });
}

export async function enqueueCanvasJobBatch(
  type: string,
  payloads: Record<string, unknown>[],
): Promise<void> {
  if (payloads.length === 0) return;
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
  await getExtractRetryQueue().add(
    "extract-retry",
    { type: "extract-retry", ...data },
    { ...DEFAULT_OPTS, delay: delaySeconds * 1000 },
  );
}

export function getQueueConnection(): IORedis {
  return getConnection();
}
