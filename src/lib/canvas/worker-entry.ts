/**
 * Canvas Worker Entry Point
 *
 * Queue consumers plus DB recovery polls for lost publications and stale
 * claims. New extraction retries share the Canvas import queue; the dedicated
 * retry consumer remains active to drain compatible messages already there.
 *
 * Consumers start before any maintenance so a long retention pass never
 * delays job consumption after a deploy. Every periodic task is
 * non-overlapping and contained, so one failing poll cannot crash the process
 * and take in-flight jobs with it.
 *
 * Run: npx tsx src/lib/canvas/worker-entry.ts
 */
import { flush } from "@sentry/core";
import { monitorOperation } from "../monitoring/operations";
import logger from "../logger";
import sql from "../../database/pgsql";
import {
  closeQueues,
  enqueueCanvasDiscoverJob,
  enqueueRecoveredChatGeneration,
  getQueueProvider,
} from "../queue.ts";
import {
  dispatchMarkerJob,
  recoverMarkerDispatchJobs,
} from "../marker/serverless";
import { markerDispatchConsumerEnabled } from "../marker/worker-config";
import { processChatGeneration } from "../chat/generate-background";
import {
  pruneChatGenerationPayloads,
  recoverStaleChatGenerations,
} from "../chat/generation-store";
import { processVaultImport } from "../vault/import-worker";
import { reindexNote } from "../rag/note-reindex";
import { cleanupVaultArtifacts } from "../vault/artifacts";
import { processVaultExport } from "../vault/export-worker";
import { cleanupMarketingData } from "../marketing/retention";
import { purgeDeletedAccounts } from "../auth/account-purge";
import { processNextStudyJob, reconcileStudyMaps } from "../study-map/jobs";
import {
  processPendingNoteDeletionCleanup,
  purgeExpiredTrash,
  reconcileTrashedVectorVisibility,
} from "../notes/storage/note-lifecycle";
import { startQueueConsumers } from "../worker/consumers";
import {
  WORKER_HEARTBEAT_INTERVAL_MS,
  clearWorkerHeartbeat,
  writeWorkerHeartbeat,
} from "../worker/heartbeat";
import { drainStudyJobs, pruneInBatches } from "../worker/maintenance";
import { startPeriodicTask, type PeriodicTask } from "../worker/periodic";
import { checkAndCompleteJob } from "./import-extraction";
import { recoverCanvasExecutions } from "./execution-recovery";
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
import { dispatchFairCanvasFiles } from "./import-scheduler";
import { runImportedFileCacheRetention } from "./import-cache-retention";
import { dispatchCanvasJob, type CanvasJob } from "./job-dispatch";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const MAX_CONCURRENT_JOBS = 10;

function positiveIntegerEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// docker stop sends SIGKILL after 10 seconds by default. Exit just before
// that so database and Redis connections close cleanly; anything still
// running is redelivered and fenced by its database claim
const SHUTDOWN_GRACE_MS = positiveIntegerEnv("WORKER_SHUTDOWN_GRACE_MS", 5_000);

// On unless explicitly disabled, so an existing worker keeps consuming Marker
// dispatches after an upgrade. The healthcheck uses the same parser.
const MARKER_DISPATCH_CONSUMER_ENABLED = markerDispatchConsumerEnabled();

export async function processCanvasJob(job: CanvasJob): Promise<void> {
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
}

// Run each step on its own so one failing repair does not skip the others.
async function runSteps(steps: Array<[string, () => Promise<unknown>]>): Promise<void> {
  for (const [step, work] of steps) {
    try {
      await work();
    } catch (error) {
      logger.error("worker maintenance step failed", { step, error });
    }
  }
}

async function settleStuckJobs(): Promise<void> {
  const recovered = await recoverCanvasExecutions();
  const settled = await sql<{ id: string }[]>`
    SELECT job.id FROM app.canvas_import_jobs job WHERE job.type = 'canvas' AND job.status = 'processing'
      AND NOT EXISTS (SELECT 1 FROM app.canvas_imports child WHERE child.job_id = job.id
        AND child.status NOT IN ('complete', 'forbidden', 'error', 'cancelled'))
    LIMIT 50
  `;
  const jobIds = [...new Set([...recovered, ...settled.map((job) => job.id)])];
  await runSteps(jobIds.map((jobId) => [`complete ${jobId}`, async () => {
    const [job] = await sql<{ user_id: string }[]>`
      SELECT user_id FROM app.canvas_import_jobs WHERE id = ${jobId}::uuid
    `;
    if (job) await checkAndCompleteJob(jobId, job.user_id);
  }]));
}

// Re-enqueue jobs whose publication was lost, without treating an active
// discovery as orphaned. The worker atomically claims queued work; resetting a
// stale discovery to queued makes that handoff safe across replicas.
// Deactivated accounts are skipped; their jobs are cancelled on deletion.
async function republishQueuedCanvasJobs(): Promise<void> {
  const queued = await sql<{ id: string; user_id: string; execution_attempts: number }[]>`
    UPDATE app.canvas_import_jobs job
    SET updated_at = NOW()
    FROM app.login l
    WHERE job.status = 'queued'
      AND job.type = 'canvas'
      AND job.updated_at < NOW() - INTERVAL '1 minute'
      AND l.user_id = job.user_id AND l.is_active AND l.deleted_at IS NULL
    RETURNING job.id, job.user_id, job.execution_attempts
  `;
  await runSteps(queued.map((row) => [
    `republish discovery ${row.id}`,
    () => enqueueCanvasDiscoverJob(row.id, row.user_id, row.execution_attempts),
  ]));
}

async function recoverChatGenerations(): Promise<void> {
  if (getQueueProvider() !== "bullmq") return;
  const stale = await recoverStaleChatGenerations();
  await Promise.all(stale.map((generationId) => enqueueRecoveredChatGeneration(generationId)));
}

async function repairQueues(): Promise<void> {
  await runSteps([
    ["republish queued canvas jobs", republishQueuedCanvasJobs],
    ["recover chat generations", recoverChatGenerations],
    ["recover extraction retries", () => recoverPendingExtractionRetries()],
    ["recover canvas extracts", () => recoverPendingCanvasExtracts()],
    ["recover marker dispatch", async () => {
      if (MARKER_DISPATCH_CONSUMER_ENABLED) await recoverMarkerDispatchJobs();
    }],
    ["dispatch canvas files", () => dispatchFairCanvasFiles(MAX_CONCURRENT_JOBS)],
  ]);
}

async function pruneChatPayloads(): Promise<void> {
  const pruned = await pruneInBatches(pruneChatGenerationPayloads);
  logger.info("chat generation payloads pruned", { count: pruned });
}

async function runDailyMaintenance(): Promise<void> {
  await runSteps([
    ["prune chat payloads", pruneChatPayloads],
    ["marketing retention", cleanupMarketingData],
    ["imported file cache retention", () => runImportedFileCacheRetention()],
    // purging expired Trash roots can create external-cleanup tasks, so
    // process those second and let one daily pass finish both
    ["purge expired trash", purgeExpiredTrash],
    ["note deletion cleanup", processPendingNoteDeletionCleanup],
    ["expire chat tool actions", () => sql`DELETE FROM app.chat_tool_actions WHERE expires_at <= NOW()`],
    ["trashed vector visibility", reconcileTrashedVectorVisibility],
    ["purge deleted accounts", purgeDeletedAccounts],
  ]);
}

const consumers = await startQueueConsumers({
  processJob: processCanvasJob,
  processChatGeneration: (generationId, attemptsStarted, maxAttempts) =>
    monitorOperation("worker.chat", () =>
      processChatGeneration(generationId, attemptsStarted, maxAttempts),
    ),
  jobConcurrency: MAX_CONCURRENT_JOBS,
  chatConcurrency: positiveIntegerEnv("CHAT_GENERATION_CONCURRENCY", 2),
  markerDispatch: {
    enabled: MARKER_DISPATCH_CONSUMER_ENABLED,
    concurrency: positiveIntegerEnv("MARKER_DISPATCH_CONCURRENCY", 1),
  },
});

// declared before the tasks: runNow starts the study drain synchronously and
// it reads this flag between jobs
let shuttingDown = false;

const tasks: PeriodicTask[] = [
  startPeriodicTask("heartbeat", async () => {
    if (consumers.isRunning()) await writeWorkerHeartbeat();
  }, WORKER_HEARTBEAT_INTERVAL_MS, { runNow: true }),
  startPeriodicTask("repair queues", repairQueues, 30_000, { runNow: true }),
  startPeriodicTask("settle stuck jobs", settleStuckJobs, 5 * MINUTE_MS, { runNow: true }),
  startPeriodicTask("vault artifact cleanup", cleanupVaultArtifacts, 5 * MINUTE_MS, { runNow: true }),
  startPeriodicTask(
    "study jobs",
    () => drainStudyJobs(processNextStudyJob, () => shuttingDown),
    5_000,
    { runNow: true },
  ),
  startPeriodicTask("study map reconciliation", reconcileStudyMaps, MINUTE_MS, { runNow: true }),
  startPeriodicTask("daily maintenance", runDailyMaintenance, DAY_MS, { runNow: true }),
];
logger.info("worker_event");

function withinGrace(work: Promise<unknown>): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, SHUTDOWN_GRACE_MS);
    void work.finally(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("worker_event");
  for (const task of tasks) task.stop();
  await clearWorkerHeartbeat().catch(() => undefined);
  await withinGrace(Promise.allSettled([
    consumers.close(),
    ...tasks.map((task) => task.idle()),
  ]));
  await closeQueues().catch(() => undefined);
  await sql.end({ timeout: 3 }).catch(() => undefined);
  await flush(2000);
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
