/**
 * Canvas Worker Entry Point
 * SQS polling + DB safety-net for processing Canvas import jobs on Fargate.
 * Run: npx tsx src/lib/canvas/worker-entry.js
 *
 * Primary: SQS long-poll for real-time dispatch
 * Safety net: DB poll every 30s catches orphaned jobs (SQS delivery failures)
 */

import sql from "../../database/pgsql.js";
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  ChangeMessageVisibilityCommand,
} from "@aws-sdk/client-sqs";
import { ECSClient, UpdateServiceCommand } from "@aws-sdk/client-ecs";
import {
  processImportJob,
  processDiscoverJob,
  processCanvasFile,
  processExtractionRetry,
  processDirectExtraction,
} from "./import-worker.js";
import { processVaultImport } from "../vault/import-worker.js";
import { processVaultExport } from "../vault/export-worker.js";

const STUCK_JOB_THRESHOLD = "1 hour";
const STUCK_JOB_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const DB_POLL_INTERVAL_MS = 30_000;
const IDLE_POLLS_BEFORE_SHUTDOWN = 30; // 30 × 20s = ~10 min idle
const MAX_CONCURRENT_JOBS = 10; // SQS max per batch; actual concurrency is controlled by globalFileLimiter in import-worker

const idlePollsBeforeShutdownEnv = Number.parseInt(
  process.env.WORKER_IDLE_POLLS_BEFORE_SHUTDOWN ?? "",
  10,
);
const effectiveIdlePollsBeforeShutdown =
  Number.isInteger(idlePollsBeforeShutdownEnv) && idlePollsBeforeShutdownEnv > 0
    ? idlePollsBeforeShutdownEnv
    : IDLE_POLLS_BEFORE_SHUTDOWN;
const keepWarmMode =
  String(process.env.WORKER_KEEP_WARM ?? "").toLowerCase() === "true";

const sqsClient = new SQSClient({
  region: process.env.AWS_REGION ?? "eu-west-1",
});
const QUEUE_URL = process.env.SQS_QUEUE_URL;
const RETRY_QUEUE_URL = process.env.SQS_EXTRACT_RETRY_QUEUE_URL;

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

// DB safety-net: reclaim jobs that SQS missed or whose worker crashed.
// queued orphans are claimed atomically via UPDATE to avoid races.
// discovering orphans (SQS message lost after mid-discovery crash) are re-queued
// only after a generous timeout so legitimate slow discoveries aren't interrupted.
async function claimOrphanedJobs() {
  // atomic claim: transition queued → discovering in a single statement,
  // so only one worker can claim each job (no FOR UPDATE race)
  const queuedOrphans = await sql`
    UPDATE app.canvas_import_jobs
    SET status = 'discovering', started_at = NOW()
    WHERE status = 'queued'
      AND created_at < NOW() - INTERVAL '15 seconds'
    RETURNING id
  `;

  // jobs stuck in 'discovering' for longer than the stuck-job threshold
  // — the canvas-discover SQS message was lost; safe to retry discovery
  const discoveringOrphans = await sql`
    SELECT id FROM app.canvas_import_jobs
    WHERE status = 'discovering'
      AND started_at < NOW() - ${STUCK_JOB_THRESHOLD}::interval / 2
    LIMIT ${MAX_CONCURRENT_JOBS}
  `;

  const orphaned = [...queuedOrphans, ...discoveringOrphans];
  if (orphaned.length === 0) return false;

  console.log(
    `[${new Date().toISOString()}] DB poll: found ${orphaned.length} orphaned job(s)`,
  );
  const results = await Promise.allSettled(
    orphaned.map((row) => processDiscoverJob(row.id)),
  );
  for (const r of results) {
    if (r.status === "rejected") {
      console.error(
        `[${new Date().toISOString()}] Orphaned job error:`,
        r.reason?.message,
      );
    }
  }
  return true;
}

async function processAndDelete(message, queueUrl) {
  const ts = () => new Date().toISOString();
  let body;
  try {
    body = JSON.parse(message.Body);
  } catch (err) {
    console.error(`[${ts()}] Malformed SQS message, deleting:`, err.message);
    await sqsClient.send(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: message.ReceiptHandle,
      }),
    );
    return;
  }
  const type = body.type ?? "canvas-import";
  console.log(
    `[${ts()}] Received ${type}: ${body.jobId ?? body.userId ?? "unknown"}`,
  );

  switch (type) {
    case "canvas-discover":
      await processDiscoverJob(body.jobId);
      break;
    case "canvas-file":
      await processCanvasFile(body);
      break;
    // legacy message type — kept for any in-flight messages during deploy
    case "canvas-import":
      await processImportJob(body.jobId);
      break;
    case "extract":
      await processDirectExtraction(body);
      break;
    case "extract-retry":
      await processExtractionRetry(body);
      break;
    case "vault-export":
      await processVaultExport(body);
      break;
    case "vault-import":
      await processVaultImport(body);
      break;
    default:
      console.warn(`[${ts()}] Unknown job type: ${type}`);
  }

  await sqsClient.send(
    new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: message.ReceiptHandle,
    }),
  );
  console.log(`[${ts()}] Done, message deleted`);
}

// tracks all in-flight processing promises so the main loop can maintain a
// sliding window of concurrent work rather than blocking on each batch
const inFlight = new Set();

function launchProcessing(message, queueUrl) {
  const heartbeat = setInterval(async () => {
    try {
      await sqsClient.send(new ChangeMessageVisibilityCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: message.ReceiptHandle,
        VisibilityTimeout: 600,
      }));
    } catch { /* message may already be deleted, ignore */ }
  }, 5 * 60 * 1000);

  const p = processAndDelete(message, queueUrl)
    .catch((err) => {
      console.error(
        `[${new Date().toISOString()}] Job processing error:`,
        err?.message,
      );
    })
    .finally(() => { clearInterval(heartbeat); inFlight.delete(p); });
  inFlight.add(p);
}

// polls for up to (MAX_CONCURRENT_JOBS - inFlight) messages and launches them
// without waiting for them to finish — returns true if any messages were received
async function pollQueue() {
  if (!QUEUE_URL) return false;
  const capacity = MAX_CONCURRENT_JOBS - inFlight.size;
  if (capacity <= 0) return false;

  const res = await sqsClient.send(
    new ReceiveMessageCommand({
      QueueUrl: QUEUE_URL,
      MaxNumberOfMessages: Math.min(10, capacity),
      WaitTimeSeconds: 20,
      VisibilityTimeout: 3600,
    }),
  );

  const messages = res.Messages ?? [];
  if (messages.length === 0) return false;

  for (const m of messages) {
    launchProcessing(m, QUEUE_URL);
  }
  return true;
}

// drains the extraction retry queue (short poll, non-blocking)
async function pollRetryQueue() {
  if (!RETRY_QUEUE_URL) return false;
  const capacity = MAX_CONCURRENT_JOBS - inFlight.size;
  if (capacity <= 0) return false;

  const res = await sqsClient.send(
    new ReceiveMessageCommand({
      QueueUrl: RETRY_QUEUE_URL,
      MaxNumberOfMessages: Math.min(10, capacity),
      WaitTimeSeconds: 0,
      VisibilityTimeout: 300,
    }),
  );

  const messages = res.Messages ?? [];
  if (messages.length === 0) return false;

  for (const m of messages) {
    launchProcessing(m, RETRY_QUEUE_URL);
  }
  return true;
}

// ── Main loop ────────────────────────────────────────────────────────────────

console.log(
  `[${new Date().toISOString()}] Canvas Import Worker started (SQS + DB poll, idleThreshold=${effectiveIdlePollsBeforeShutdown}, keepWarm=${keepWarmMode})`,
);

await failStuckJobs();
setInterval(failStuckJobs, STUCK_JOB_CHECK_INTERVAL_MS);
setInterval(async () => {
  try {
    await claimOrphanedJobs();
  } catch (err) {
    console.error(`[${new Date().toISOString()}] DB poll error:`, err.message);
  }
}, DB_POLL_INTERVAL_MS);

let idlePolls = 0;
let pollErrorCount = 0;

while (true) {
  try {
    // if at capacity, yield until one slot frees before polling again
    if (inFlight.size >= MAX_CONCURRENT_JOBS) {
      await Promise.race(inFlight);
      continue;
    }

    const hadWork = await pollQueue();
    const hadRetries = await pollRetryQueue();
    pollErrorCount = 0;

    // only count as idle when there's nothing in-flight and both queues were empty
    const isIdle = !hadWork && !hadRetries && inFlight.size === 0;
    idlePolls = isIdle ? idlePolls + 1 : 0;

    // if we launched new work but the queues aren't empty yet, yield briefly so
    // the next poll can immediately fill capacity without a 20s long-poll delay
    if (!isIdle && inFlight.size > 0 && !hadWork && !hadRetries) {
      await Promise.race([
        Promise.race(inFlight),
        new Promise((r) => setTimeout(r, 500)),
      ]);
    }

    if (idlePolls >= effectiveIdlePollsBeforeShutdown) {
      // final DB check before scaling down
      if (await claimOrphanedJobs()) {
        idlePolls = 0;
        continue;
      }

      if (keepWarmMode) {
        console.log(
          `[${new Date().toISOString()}] ${effectiveIdlePollsBeforeShutdown} idle polls reached, keep-warm mode active; continuing`,
        );
        idlePolls = 0;
        continue;
      }

      console.log(
        `[${new Date().toISOString()}] ${effectiveIdlePollsBeforeShutdown} idle polls reached, scaling down`,
      );
      try {
        const ecsClient = new ECSClient({
          region: process.env.AWS_REGION ?? "eu-west-1",
        });
        await ecsClient.send(
          new UpdateServiceCommand({
            cluster: process.env.ECS_CLUSTER ?? "oghmanotes",
            service: process.env.ECS_SERVICE ?? "canvas-import-worker",
            desiredCount: 0,
          }),
        );
      } catch (scaleErr) {
        console.error(
          `[${new Date().toISOString()}] Self scale-down failed:`,
          scaleErr.message,
        );
      }
      process.exit(0);
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Poll error:`, err.message);
    pollErrorCount++;
    const backoffMs = Math.min(1000 * 2 ** (pollErrorCount - 1), 30_000);
    await new Promise((r) => setTimeout(r, backoffMs + Math.random() * 500));
  }
}
