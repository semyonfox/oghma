#!/usr/bin/env node

import sql from "../src/database/pgsql.ts";
import {
  CANVAS_IMPORT_QUEUE,
  CHAT_GENERATION_QUEUE,
  EXTRACT_RETRY_QUEUE,
  MARKER_DISPATCH_QUEUE,
  getMarkerDispatchQueue,
  getQueueConnection,
  getQueueProvider,
} from "../src/lib/queue.ts";
import {
  validateMarkerWorkerConfiguration,
} from "../src/lib/marker/worker-config.ts";
import {
  WORKER_HEARTBEAT_MAX_AGE_MS,
  readWorkerHeartbeatAge,
  workerHeartbeatPath,
} from "../src/lib/worker/heartbeat.ts";
import { Queue } from "bullmq";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requireEnv(name: string): void {
  if (!process.env[name]) {
    throw new Error(`${name} is required`);
  }
}

async function checkDatabase(): Promise<void> {
  await sql`SELECT 1`;
}

async function checkBullMq(
  markerDispatchConsumerEnabled: boolean,
): Promise<void> {
  const connection = getQueueConnection();
  const canvasQueue = new Queue(CANVAS_IMPORT_QUEUE, { connection });
  const retryQueue = new Queue(EXTRACT_RETRY_QUEUE, { connection });
  const chatQueue = new Queue(CHAT_GENERATION_QUEUE, { connection });
  const markerQueue = markerDispatchConsumerEnabled
    ? getMarkerDispatchQueue()
    : null;
  try {
    const pong = await connection.ping();
    if (pong !== "PONG") {
      throw new Error(`Redis ping returned ${pong}`);
    }

    await Promise.all([
      canvasQueue.waitUntilReady(),
      retryQueue.waitUntilReady(),
      chatQueue.waitUntilReady(),
      ...(markerQueue ? [markerQueue.waitUntilReady()] : []),
    ]);
    await Promise.all([
      canvasQueue.getJobCounts("waiting", "active", "delayed"),
      retryQueue.getJobCounts("waiting", "active", "delayed"),
      chatQueue.getJobCounts("waiting", "active", "delayed", "failed"),
      ...(markerQueue ? [markerQueue.getJobCounts("waiting", "active", "delayed")] : []),
    ]);
    console.log(
      `[worker-healthcheck] BullMQ ready: ${CANVAS_IMPORT_QUEUE}, ${EXTRACT_RETRY_QUEUE}, ${CHAT_GENERATION_QUEUE}${markerQueue ? `, ${MARKER_DISPATCH_QUEUE}` : ""}`,
    );
  } finally {
    await Promise.allSettled([
      canvasQueue.close(),
      retryQueue.close(),
      chatQueue.close(),
      ...(markerQueue ? [markerQueue.close()] : []),
      connection.quit(),
    ]);
  }
}

// A worker that just started writes its first heartbeat once its consumers
// are up, so give it a bounded window before declaring it unhealthy.
async function checkWorkerHeartbeat(): Promise<void> {
  const waitMs = Number.parseInt(process.env.WORKER_HEALTHCHECK_WAIT_MS ?? "", 10);
  const deadline = Date.now() + (Number.isFinite(waitMs) && waitMs >= 0 ? waitMs : 20_000);
  const file = workerHeartbeatPath();
  for (;;) {
    const age = await readWorkerHeartbeatAge(file);
    if (age !== null && age <= WORKER_HEARTBEAT_MAX_AGE_MS) {
      console.log(`[worker-healthcheck] worker heartbeat ${Math.round(age / 1000)}s old`);
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        age === null
          ? `no worker heartbeat at ${file}; is the worker running in this container?`
          : `worker heartbeat is ${Math.round(age / 1000)}s old; consumers are stopped or the event loop is blocked`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

function checkCloudflareQueueConfig(
  markerDispatchConsumerEnabled: boolean,
): void {
  requireEnv("CLOUDFLARE_ACCOUNT_ID");
  requireEnv("CLOUDFLARE_QUEUES_API_TOKEN");
  requireEnv("CLOUDFLARE_CANVAS_IMPORT_QUEUE_ID");
  requireEnv("CLOUDFLARE_EXTRACT_RETRY_QUEUE_ID");
  if (markerDispatchConsumerEnabled) {
    requireEnv("CLOUDFLARE_MARKER_DISPATCH_QUEUE_ID");
  }
  console.log("[worker-healthcheck] Cloudflare queue config present");
}

try {
  const provider = getQueueProvider();
  const markerConfiguration = validateMarkerWorkerConfiguration();
  await checkDatabase();
  if (provider === "bullmq") {
    await checkBullMq(markerConfiguration.markerDispatchConsumerEnabled);
  } else {
    checkCloudflareQueueConfig(markerConfiguration.markerDispatchConsumerEnabled);
  }
  await checkWorkerHeartbeat();
  console.log(`[worker-healthcheck] ok (${provider})`);
} catch (err: unknown) {
  console.error("[worker-healthcheck] failed:", errorMessage(err));
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
