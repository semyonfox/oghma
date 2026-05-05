/**
 * Canvas Worker Entry Point
 *
 * BullMQ workers for canvas-import + extract-retry queues, plus a DB safety-net
 * that reclaims jobs whose enqueue dropped (atomic UPDATE claims queued orphans).
 *
 * Run: npx tsx src/lib/canvas/worker-entry.js
 */

import sql from "../../database/pgsql.js";
import { Worker } from "bullmq";
import {
  CANVAS_IMPORT_QUEUE,
  EXTRACT_RETRY_QUEUE,
  enqueueCanvasJob,
  getQueueConnection,
} from "../queue.ts";
import {
  processImportJob,
  processDiscoverJob,
  processCanvasFile,
  processExtractionRetry,
  processDirectExtraction,
  processMarkerComplete,
} from "./import-worker.js";
import { processVaultImport } from "../vault/import-worker.js";
import { processVaultExport } from "../vault/export-worker.js";

const STUCK_JOB_THRESHOLD = "1 hour";
const STUCK_JOB_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const DB_POLL_INTERVAL_MS = 30_000;
const MAX_CONCURRENT_JOBS = 10;

async function failStuckJobs() {
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
async function claimOrphanedJobs() {
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

async function processCanvasJob(job) {
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
  `[${new Date().toISOString()}] Canvas Import Worker started (BullMQ + DB poll, concurrency=${MAX_CONCURRENT_JOBS})`,
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

const shutdown = async (signal) => {
  console.log(
    `[${new Date().toISOString()}] received ${signal}, draining workers`,
  );
  await Promise.allSettled([canvasWorker.close(), retryWorker.close()]);
  await sql.end({ timeout: 5 });
  process.exit(0);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
