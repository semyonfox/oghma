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
  CHAT_GENERATION_QUEUE,
  EXTRACT_RETRY_QUEUE,
  ackCloudflareQueueMessages,
  enqueueCanvasJob,
  getQueueProvider,
  getQueueConnection,
  parseCloudflareQueueBody,
  pullCloudflareQueueMessages,
  type CloudflarePulledMessage,
} from "../queue.ts";
import { processChatGeneration } from "../chat/generate-background";
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
import { cleanupMarketingData } from "../marketing/retention";
import { dispatchFairCanvasFiles } from "./import-scheduler";

const STUCK_JOB_THRESHOLD = "1 hour";
const STUCK_JOB_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const DB_POLL_INTERVAL_MS = 30_000;
const MARKETING_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
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

type CanvasJobData = Record<string, unknown>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requireJobData(job: { data?: CanvasJobData }): CanvasJobData {
  if (!job.data) {
    throw new Error("Job data is missing");
  }
  return job.data;
}

function requireString(data: CanvasJobData, field: string): string {
  const value = data[field];
  if (typeof value !== "string") {
    throw new Error(`Job data field ${field} is missing or invalid`);
  }
  return value;
}

function requireCanvasFileData(
  data: CanvasJobData,
): { importRecordId: string; jobId: string; userId: string } {
  return {
    importRecordId: requireString(data, "importRecordId"),
    jobId: requireString(data, "jobId"),
    userId: requireString(data, "userId"),
  };
}

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

async function runMarketingCleanup(): Promise<void> {
  try {
    const result = await cleanupMarketingData();
    console.log(
      `[${new Date().toISOString()}] Marketing retention cleanup: ${result.eventsDeleted} event(s), ${result.leadsDeleted} lead(s) deleted`,
    );
  } catch (err) {
    console.error(
      `[${new Date().toISOString()}] Marketing retention cleanup failed:`,
      errorMessage(err),
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
        errorMessage(err),
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
  const data = job.data ?? {};
  const type = typeof data.type === "string" ? data.type : job.name;
  console.log(
    `[${ts()}] Received ${type}: ${data.jobId ?? data.userId ?? job.id}`,
  );

  switch (type) {
    case "canvas-discover":
      await processDiscoverJob(requireString(requireJobData(job), "jobId"));
      return;
    case "canvas-file":
      await processCanvasFile(requireCanvasFileData(requireJobData(job)));
      return;
    // legacy message type — kept for any in-flight messages during deploy
    case "canvas-import":
      await processImportJob(requireString(requireJobData(job), "jobId"));
      return;
    case "extract":
      await processDirectExtraction(requireJobData(job));
      return;
    case "extract-retry":
      await processExtractionRetry(requireJobData(job));
      return;
    case "marker-complete":
      await processMarkerComplete(requireJobData(job));
      return;
    case "vault-export":
      await processVaultExport(requireJobData(job));
      return;
    case "vault-import":
      await processVaultImport(requireJobData(job));
      return;
    default:
      console.warn(`[${ts()}] Unknown job type: ${type}`);
  }
}

console.log(
  `[${new Date().toISOString()}] Canvas Import Worker started (${getQueueProvider()} + DB poll, concurrency=${MAX_CONCURRENT_JOBS})`,
);

await failStuckJobs();
await runMarketingCleanup();
setInterval(failStuckJobs, STUCK_JOB_CHECK_INTERVAL_MS);
setInterval(runMarketingCleanup, MARKETING_CLEANUP_INTERVAL_MS);
setInterval(async () => {
  try {
    await claimOrphanedJobs();
    await dispatchFairCanvasFiles(MAX_CONCURRENT_JOBS);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] DB poll error:`, errorMessage(err));
  }
}, DB_POLL_INTERVAL_MS);

let workers: Array<{ close: () => Promise<void> }> = [];
let shuttingDown = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cloudflareJobFromMessage(
  message: CloudflarePulledMessage,
): { id: string; name: string; data: CanvasJobData } {
  const data = parseCloudflareQueueBody(message);
  const type = typeof data.type === "string" ? data.type : "unknown";
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

  const acks: string[] = [];
  const retries: { lease_id: string; delay_seconds: number }[] = [];
  await Promise.all(
    batch.messages.map(async (message) => {
      try {
        await processCanvasJob(cloudflareJobFromMessage(message));
        acks.push(message.lease_id);
      } catch (err) {
        console.error(
          `[${new Date().toISOString()}] Cloudflare queue job ${message.id} failed:`,
          errorMessage(err),
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
        errorMessage(err),
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

  const chatWorker = new Worker(
    CHAT_GENERATION_QUEUE,
    async (job) => {
      const generationId = requireString(job.data ?? {}, "generationId");
      await processChatGeneration(
        generationId,
        job.attemptsStarted,
        job.opts.attempts ?? 1,
      );
    },
    {
      connection,
      concurrency: parseInt(process.env.CHAT_GENERATION_CONCURRENCY ?? "2", 10),
      lockDuration: 60_000,
      stalledInterval: 30_000,
    },
  );

  for (const w of [canvasWorker, retryWorker, chatWorker]) {
    w.on("failed", (job, err) => {
      console.error(
        `[${new Date().toISOString()}] Job ${job?.id} (${job?.name}) failed:`,
        errorMessage(err),
      );
    });
    w.on("error", (err) => {
      console.error(`[${new Date().toISOString()}] Worker error:`, errorMessage(err));
    });
  }

  workers = [canvasWorker, retryWorker, chatWorker];
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
