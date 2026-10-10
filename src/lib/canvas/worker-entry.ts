import { flush } from "@sentry/core";
import { monitorOperation } from "../monitoring/operations";
import logger from "../logger";
import { checkAndCompleteJob } from "./import-extraction";
import { recoverCanvasExecutions } from "./execution-recovery";
/**
 * Canvas Worker Entry Point
 *
 * Queue consumers plus DB recovery polls for lost publications and stale
 * claims. New extraction retries share the Canvas import queue; the dedicated
 * retry consumer remains active to drain compatible messages already there.
 *
 * Run: npx tsx src/lib/canvas/worker-entry.ts
 */

import sql from "../../database/pgsql";
import {
  CANVAS_IMPORT_QUEUE,
  CHAT_GENERATION_QUEUE,
  EXTRACT_RETRY_QUEUE,
  MARKER_DISPATCH_QUEUE,
  ackCloudflareQueueMessages,
  cloudflareAttemptsMade,
  enqueueCanvasJob,
  enqueueRecoveredChatGeneration,
  getQueueProvider,
  getQueueConnection,
  parseCloudflareQueueBody,
  pullCloudflareQueueMessages,
  type CloudflarePulledMessage,
} from "../queue.ts";
import {
  dispatchMarkerJob,
  recoverMarkerDispatchJobs,
} from "../marker/serverless";
import { markerDispatchConsumerEnabled } from "../marker/worker-config";
import { processChatGeneration } from "../chat/generate-background";
import { recoverStaleChatGenerations } from "../chat/generation-store";
import {
  processDiscoverJob,
  processCanvasFile,
  processCanvasExtract,
  recoverPendingCanvasExtracts,
  processExtractionRetry,
  recoverPendingExtractionRetries,
  processDirectExtraction,
  processMarkerComplete,
  processMarkerFailed,
} from "./import-worker";
import { processVaultImport } from "../vault/import-worker";
import { reindexNote } from "../rag/note-reindex";
import { cleanupVaultArtifacts } from "../vault/artifacts";
import { processVaultExport } from "../vault/export-worker";
import { pruneChatGenerationPayloads } from "../chat/generation-store";
import { cleanupMarketingData } from "../marketing/retention";
import { processNextStudyJob, reconcileStudyMaps } from "../study-map/jobs";
import {
  processPendingNoteDeletionCleanup,
  purgeExpiredTrash,
  reconcileTrashedVectorVisibility,
} from "../notes/storage/note-lifecycle";
import { dispatchFairCanvasFiles } from "./import-scheduler";
import { runImportedFileCacheRetention } from "./import-cache-retention";
import {
  dispatchCanvasJob,
  requireJobString,
  type CanvasJob,
  type CanvasJobData,
} from "./job-dispatch";

const STUCK_JOB_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const DB_POLL_INTERVAL_MS = 30_000;
const STUDY_JOB_POLL_INTERVAL_MS = 5_000;
const STUDY_MAP_RECONCILE_INTERVAL_MS = 60_000;
const ORPHAN_ENQUEUE_RETRY_INTERVAL = "1 minute";
const MARKETING_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const IMPORT_CACHE_RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;
const NOTE_LIFECYCLE_RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MAX_CONCURRENT_JOBS = 10;
// On unless explicitly disabled, so an existing worker keeps consuming Marker
// dispatches after an upgrade. The healthcheck uses the same parser.
const MARKER_DISPATCH_CONSUMER_ENABLED = markerDispatchConsumerEnabled();
const MAX_CONCURRENT_MARKER_DISPATCHES = Math.max(
  1,
  parseInt(process.env.MARKER_DISPATCH_CONCURRENCY ?? "", 10) || 1,
);
const CF_QUEUE_VISIBILITY_TIMEOUT_MS = parseInt(
  process.env.CLOUDFLARE_QUEUE_VISIBILITY_TIMEOUT_MS ??
    `${12 * 60 * 60 * 1000}`,
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
  const recovered = await recoverCanvasExecutions();
  const settled = await sql<{ id: string }[]>`
    SELECT job.id FROM app.canvas_import_jobs job WHERE job.type = 'canvas' AND job.status = 'processing'
      AND NOT EXISTS (SELECT 1 FROM app.canvas_imports child WHERE child.job_id = job.id
        AND child.status NOT IN ('complete', 'forbidden', 'error', 'cancelled'))
    LIMIT 50
  `;
  for (const jobId of new Set([...recovered, ...settled.map((job) => job.id)])) {
    const [job] = await sql<{ user_id: string }[]>`SELECT user_id FROM app.canvas_import_jobs WHERE id = ${jobId}::uuid`;
    if (job) await checkAndCompleteJob(jobId, job.user_id);
  }
}

async function runMarketingCleanup(): Promise<void> {
  try {
    await pruneChatGenerationPayloads();
    await cleanupMarketingData();
    logger.info("worker_event");
  } catch (error) {
    logger.error("worker_event", { error });
  }
}

async function runImportCacheRetention(): Promise<void> {
  try {
    await runImportedFileCacheRetention();
    logger.info("worker_event");
  } catch (error) {
    logger.error("worker_event", { error });
  }
}

async function runNoteLifecycleRetention(): Promise<void> {
  try {
    // Purging expired Trash roots can create external-cleanup tasks, so run
    // task processing second and let a single daily pass finish both when
    // Qdrant and object storage are healthy.
    await purgeExpiredTrash();
    await processPendingNoteDeletionCleanup();
    await sql`DELETE FROM app.chat_tool_actions WHERE expires_at <= NOW()`;
    await reconcileTrashedVectorVisibility();
    logger.info("worker_event");
  } catch (error) {
    logger.error("worker_event", { error });
  }
}

// Re-enqueue jobs whose publication was lost, without treating an active
// discovery as orphaned. The worker atomically claims queued work; resetting a
// stale discovery to queued makes that handoff safe across replicas.
async function claimOrphanedJobs(): Promise<boolean> {
  const queuedOrphans = await sql`
    UPDATE app.canvas_import_jobs
    SET updated_at = NOW()
    WHERE status = 'queued'
      AND type = 'canvas'
      AND updated_at < NOW() - ${ORPHAN_ENQUEUE_RETRY_INTERVAL}::interval
    RETURNING id, user_id
  `;

  const orphaned = queuedOrphans;
  if (orphaned.length === 0) return false;

  logger.info("worker_event");
  for (const row of orphaned) {
    try {
      await enqueueCanvasJob("canvas-discover", {
        jobId: row.id,
        userId: row.user_id,
      });
    } catch (error) {
      logger.error("worker_event", { error });
    }
  }
  return true;
}

export async function processCanvasJob(job: CanvasJob): Promise<void> {
  logger.info("worker_event");

  try {
    const handled = await monitorOperation("worker.canvas", () =>
      dispatchCanvasJob(job, {
        processDiscoverJob,
        processCanvasFile,
        processCanvasExtract,
        processImportJob: (jobId) => processDiscoverJob(jobId),
        processDirectExtraction,
        processExtractionRetry,
        processMarkerComplete,
        processMarkerFailed,
        dispatchMarkerJob,
        processVaultExport,
        processVaultImport,
        processNoteReindex: ({ noteId, userId }) =>
          monitorOperation("worker.note-reindex", () =>
            reindexNote(noteId, userId),
          ),
      }),
    );
    if (!handled) {
      logger.warn("worker_event");
    }
  } finally {
    logger.info("worker_event");
  }
}

logger.info("worker_event");

async function recoverChatGenerations(): Promise<void> {
  if (getQueueProvider() !== "bullmq") return;
  const staleChatGenerations = await recoverStaleChatGenerations();
  await Promise.all(
    staleChatGenerations.map((generationId) =>
      enqueueRecoveredChatGeneration(generationId),
    ),
  );
  if (staleChatGenerations.length > 0) {
    logger.info("worker_event");
  }
}

await failStuckJobs();
await runMarketingCleanup();
await runImportCacheRetention();
await runNoteLifecycleRetention();
await recoverChatGenerations();
async function runVaultArtifactCleanup() {
  try {
    await cleanupVaultArtifacts();
  } catch (error) {
    logger.error("Vault artifact cleanup will retry", { error });
  }
}
void runVaultArtifactCleanup();
setInterval(runVaultArtifactCleanup, 5 * 60 * 1000);
setInterval(failStuckJobs, STUCK_JOB_CHECK_INTERVAL_MS);
setInterval(runMarketingCleanup, MARKETING_CLEANUP_INTERVAL_MS);
setInterval(runImportCacheRetention, IMPORT_CACHE_RETENTION_INTERVAL_MS);
setInterval(runNoteLifecycleRetention, NOTE_LIFECYCLE_RETENTION_INTERVAL_MS);
setInterval(async () => {
  try {
    await claimOrphanedJobs();
    await recoverChatGenerations();
    const recoveredExtractionRetries = await recoverPendingExtractionRetries();
    if (recoveredExtractionRetries > 0) {
      logger.info("worker_event");
    }
    const recoveredCanvasExtracts = await recoverPendingCanvasExtracts();
    if (recoveredCanvasExtracts > 0) {
      logger.info("worker_event");
    }
    if (MARKER_DISPATCH_CONSUMER_ENABLED) {
      const recoveredMarkerJobs = await recoverMarkerDispatchJobs();
      if (recoveredMarkerJobs > 0) {
        logger.info("worker_event");
      }
    }
    await dispatchFairCanvasFiles(MAX_CONCURRENT_JOBS);
  } catch (error) {
    logger.error("worker_event", { error });
  }
}, DB_POLL_INTERVAL_MS);

let workers: Array<{ close: () => Promise<void> }> = [];
let shuttingDown = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cloudflareJobFromMessage(message: CloudflarePulledMessage): {
  id: string;
  name: string;
  data: CanvasJobData;
  attemptsMade: number;
} {
  const data = parseCloudflareQueueBody(message);
  const type = typeof data.type === "string" ? data.type : "unknown";
  return {
    id: message.id,
    name: type,
    data,
    attemptsMade: cloudflareAttemptsMade(message.attempts),
  };
}

async function processCloudflareQueueBatch(
  queueName: string,
  concurrency: number,
): Promise<boolean> {
  const batch = await pullCloudflareQueueMessages(queueName, {
    batchSize: concurrency,
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
      } catch (error) {
        logger.error("worker_event", { error });
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

async function startCloudflarePullLoop(
  queueName: string,
  concurrency: number,
): Promise<void> {
  logger.info("worker_event");

  while (!shuttingDown) {
    try {
      const hadMessages = await processCloudflareQueueBatch(
        queueName,
        concurrency,
      );
      if (!hadMessages) {
        await sleep(CF_QUEUE_EMPTY_POLL_INTERVAL_MS);
      }
    } catch (error) {
      logger.error("worker_event", { error });
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
      const generationId = requireJobString(job.data ?? {}, "generationId");
      await monitorOperation("worker.chat", () =>
        processChatGeneration(
          generationId,
          job.attemptsStarted,
          job.opts.attempts ?? 1,
        ),
      );
    },
    {
      connection,
      concurrency: parseInt(process.env.CHAT_GENERATION_CONCURRENCY ?? "2", 10),
      lockDuration: 60_000,
      stalledInterval: 30_000,
    },
  );

  const activeWorkers = [canvasWorker, retryWorker, chatWorker];
  if (MARKER_DISPATCH_CONSUMER_ENABLED) {
    activeWorkers.push(
      new Worker(MARKER_DISPATCH_QUEUE, processCanvasJob, {
        connection,
        concurrency: MAX_CONCURRENT_MARKER_DISPATCHES,
        // A dispatch includes Vast cold-start routing and one complete conversion.
        lockDuration: 60_000,
        stalledInterval: 30_000,
      }),
    );
  }

  for (const w of activeWorkers) {
    w.on("failed", (_job, error) => {
      logger.error("worker_event", { error });
    });
    w.on("error", (error) => {
      logger.error("worker_event", { error });
    });
  }

  workers = activeWorkers;
}

if (getQueueProvider() === "cloudflare") {
  void startCloudflarePullLoop(CANVAS_IMPORT_QUEUE, MAX_CONCURRENT_JOBS);
  void startCloudflarePullLoop(EXTRACT_RETRY_QUEUE, MAX_CONCURRENT_JOBS);
  if (MARKER_DISPATCH_CONSUMER_ENABLED) {
    void startCloudflarePullLoop(
      MARKER_DISPATCH_QUEUE,
      MAX_CONCURRENT_MARKER_DISPATCHES,
    );
  }
} else {
  await startBullMqWorkers();
}

let studyJobTask: Promise<void> | undefined;
let studyMapTask: Promise<void> | undefined;

function pollStudyJobs(): void {
  if (shuttingDown || studyJobTask) return;
  studyJobTask = (async () => {
    try {
      await processNextStudyJob();
    } catch (error) {
      logger.error("study job poll failed", { error });
    }
  })().finally(() => { studyJobTask = undefined; });
}

function reconcileStudyMapMaterials(): void {
  if (shuttingDown || studyMapTask) return;
  studyMapTask = (async () => {
    try {
      await reconcileStudyMaps();
    } catch (error) {
      logger.error("study map reconciliation failed", { error });
    }
  })().finally(() => { studyMapTask = undefined; });
}

const studyJobPollTimer = setInterval(pollStudyJobs, STUDY_JOB_POLL_INTERVAL_MS);
const studyMapReconcileTimer = setInterval(reconcileStudyMapMaterials, STUDY_MAP_RECONCILE_INTERVAL_MS);
studyJobPollTimer.unref();
studyMapReconcileTimer.unref();
pollStudyJobs();
reconcileStudyMapMaterials();

const shutdown = async (): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(studyJobPollTimer);
  clearInterval(studyMapReconcileTimer);
  logger.info("worker_event");
  await Promise.allSettled([
    ...workers.map((worker) => worker.close()),
    studyJobTask,
    studyMapTask,
  ]);
  await sql.end({ timeout: 5 });
  await flush(2000);
  process.exit(0);
};
process.on("SIGTERM", () => shutdown());
process.on("SIGINT", () => shutdown());
