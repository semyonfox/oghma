/**
 * Canvas Worker Entry Point
 *
 * Queue workers for canvas-import + extract-retry queues, plus a DB safety-net
 * that reclaims jobs whose enqueue dropped (atomic UPDATE claims queued orphans).
 *
 * Run: npx tsx src/lib/canvas/worker-entry.ts
 */

import sql from "../../database/pgsql.js";
import {
  CANVAS_IMPORT_QUEUE,
  EXTRACT_RETRY_QUEUE,
  ackCloudflareQueueMessages,
  enqueueCanvasJob,
  getQueueProvider,
  getQueueConnection,
  parseCloudflareQueueBody,
  pullCloudflareQueueMessages,
} from "../queue.ts";
import {
  processImportJob,
  processDiscoverJob,
  processCanvasFile,
  processExtractionRetry,
  processDirectExtraction,
  processMarkerComplete,
} from "./import-worker";
import { processVaultImport } from "../vault/import-worker";
import { processVaultExport } from "../vault/export-worker.js";

const STUCK_JOB_THRESHOLD = "1 hour";
const STUCK_JOB_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const DB_POLL_INTERVAL_MS = 30_000;
const MAX_CONCURRENT_JOBS = 10;
const CF_QUEUE_VISIBILITY_TIMEOUT_MS = parseInt(
  process.env.CLOUDFLARE_QUEUE_VISIBILITY_TIMEOUT_MS ?? `${12 * 60 * 60 * 1000}`,
  10,
);
const CF_QUEUE_RETRY_DELAY_SECONDS = parseInt(
  process.env.CLOUDFLARE_QUEUE_RETRY_DELAY_SECONDS ?? "60",
  10,
);
const CF_QUEUE_EMPTY_POLL_INTERVAL_MS = parseInt(
  process.env.CLOUDFLARE_QUEUE_EMPTY_POLL_INTERVAL_MS ?? "5000",
  10,
);

async function failStuckJobs(): Promise<void> {
  const stuck = await sql`
    UPDATE app.canvas_import_jobs
    SET status = 'failed', error_message = 'Job timed out', updated_at = NOW()
    WHERE status IN ('processing', 'discovering') AND started_at < NOW() - ${STUCK_JOB_THRESHOLD}::interval
    RETURNING id
  `;
  if (stuck.length > 0) {
    console.log(
      `[${new Date().toISOString()}] Failed ${stuck.length} stuck job(s)`,
    );
  }
}

// reclaim queued jobs that never made it onto the BullMQ queue (rare —
// happens when API enqueue throws or the worker died mid-discovery).
async function claimOrphanedJobs(): Promise<boolean> {
  const queuedOrphans = await sql`
    UPDATE app.canvas_import_jobs
    SET status = 'discovering', started_at = NOW()
    WHERE status = 'queued'
      AND created_at < NOW() - INTERVAL '15 seconds'
    RETURNING id, user_id
  `;

  // jobs stuck in 'discovering' for too long — re-enqueue discovery
  const discoveringOrphans = await sql`
    SELECT id, user_id FROM app.canvas_import_jobs
    WHERE status = 'discovering'
      AND started_at < NOW() - ${STUCK_JOB_THRESHOLD}::interval / 2
    LIMIT ${MAX_CONCURRENT_JOBS}
  `;

  const orphaned = [...queuedOrphans, ...discoveringOrphans];
  if (orphaned.length === 0) return false;

  console.log(
    `[${new Date().toISOString()}] DB poll: re-queuing ${orphaned.length} orphaned job(s)`,
  );
  for (const row of orphaned) {
    try {
      await enqueueCanvasJob("canvas-discover", { jobId: row.id, userId: row.user_id });
    } catch (err) {
      console.error(
        `[${new Date().toISOString()}] orphan re-enqueue failed:`,
        err?.message,
      );
    }
  }
  return true;
}

export async function processCanvasJob(job: {
  data?: Record<string, unknown>;
  name?: string;
  id?: string;
}): Promise<void> {
  const ts = () => new Date().toISOString();
  const type = job.data?.type ?? job.name;
  console.log(
    `[${ts()}] Received ${type}: ${job.data?.jobId ?? job.data?.userId ?? job.id}`,
  );

  switch (type) {
    case "canvas-discover":
      await processDiscoverJob(job.data.jobId);
      return;
    case "canvas-file":
      await processCanvasFile(job.data);
      return;
    // legacy message type — kept for any in-flight messages during deploy
    case "canvas-import":
      await processImportJob(job.data.jobId);
      return;
    case "extract":
      await processDirectExtraction(job.data);
      return;
    case "extract-retry":
      await processExtractionRetry(job.data);
      return;
    case "marker-complete":
      await processMarkerComplete(job.data);
      return;
    case "vault-export":
      await processVaultExport(job.data);
      return;
    case "vault-import":
      await processVaultImport(job.data);
      return;
    default:
      console.warn(`[${ts()}] Unknown job type: ${type}`);
  }
}

console.log(
  `[${new Date().toISOString()}] Canvas Import Worker started (${getQueueProvider()} + DB poll, concurrency=${MAX_CONCURRENT_JOBS})`,
);

await failStuckJobs();
setInterval(failStuckJobs, STUCK_JOB_CHECK_INTERVAL_MS);
setInterval(async () => {
  try {
    await claimOrphanedJobs();
  } catch (err) {
    console.error(`[${new Date().toISOString()}] DB poll error:`, err?.message);
  }
}, DB_POLL_INTERVAL_MS);

let workers: Array<{ close: () => Promise<void> }> = [];
let shuttingDown = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cloudflareJobFromMessage(message: {
  id: string;
  data?: Record<string, string>;
}): { id: string; name: string; data: Record<string, unknown> } {
  const data = parseCloudflareQueueBody(message);
  const type = data.type ?? "unknown";
  return {
    id: message.id,
    name: type,
    data,
  };
}

async function processCloudflareQueueBatch(queueName: string): Promise<boolean> {
  const batch = await pullCloudflareQueueMessages(queueName, {
    batchSize: MAX_CONCURRENT_JOBS,
    visibilityTimeoutMs: CF_QUEUE_VISIBILITY_TIMEOUT_MS,
  });

  if (batch.messages.length === 0) return false;

  const acks = [];
  const retries = [];
  await Promise.all(
    batch.messages.map(async (message) => {
      try {
        await processCanvasJob(cloudflareJobFromMessage(message));
        acks.push(message.lease_id);
      } catch (err) {
        console.error(
          `[${new Date().toISOString()}] Cloudflare queue job ${message.id} failed:`,
          err?.message,
        );
        retries.push({
          lease_id: message.lease_id,
          delay_seconds: CF_QUEUE_RETRY_DELAY_SECONDS,
        });
      }
    }),
  );

  await ackCloudflareQueueMessages(queueName, acks, retries);
  return true;
}

async function startCloudflarePullLoop(queueName: string): Promise<void> {
  console.log(
    `[${new Date().toISOString()}] Starting Cloudflare pull consumer for ${queueName}`,
  );

  while (!shuttingDown) {
    try {
      const hadMessages = await processCloudflareQueueBatch(queueName);
      if (!hadMessages) {
        await sleep(CF_QUEUE_EMPTY_POLL_INTERVAL_MS);
      }
    } catch (err) {
      console.error(
        `[${new Date().toISOString()}] Cloudflare pull error for ${queueName}:`,
        err?.message,
      );
      await sleep(CF_QUEUE_EMPTY_POLL_INTERVAL_MS);
    }
  }
}

async function startBullMqWorkers(): Promise<void> {
  const { Worker } = await import("bullmq");
  const connection = getQueueConnection();

  const canvasWorker = new Worker(CANVAS_IMPORT_QUEUE, processCanvasJob, {
    connection,
    concurrency: MAX_CONCURRENT_JOBS,
    // long-running jobs (canvas import) extend lock automatically while active
    lockDuration: 60_000,
    stalledInterval: 30_000,
  });

  const retryWorker = new Worker(EXTRACT_RETRY_QUEUE, processCanvasJob, {
    connection,
    concurrency: MAX_CONCURRENT_JOBS,
    lockDuration: 60_000,
    stalledInterval: 30_000,
  });

  for (const w of [canvasWorker, retryWorker]) {
    w.on("failed", (job, err) => {
      console.error(
        `[${new Date().toISOString()}] Job ${job?.id} (${job?.name}) failed:`,
        err?.message,
      );
    });
    w.on("error", (err) => {
      console.error(`[${new Date().toISOString()}] Worker error:`, err?.message);
    });
  }

  workers = [canvasWorker, retryWorker];
}

if (getQueueProvider() === "cloudflare") {
  void startCloudflarePullLoop(CANVAS_IMPORT_QUEUE);
  void startCloudflarePullLoop(EXTRACT_RETRY_QUEUE);
} else {
  await startBullMqWorkers();
}

const shutdown = async (signal: string): Promise<void> => {
  shuttingDown = true;
  console.log(
    `[${new Date().toISOString()}] received ${signal}, draining workers`,
  );
  await Promise.allSettled(workers.map((worker) => worker.close()));
  await sql.end({ timeout: 5 });
  process.exit(0);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
