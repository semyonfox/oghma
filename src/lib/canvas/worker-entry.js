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
} from "@aws-sdk/client-sqs";
import { ECSClient, UpdateServiceCommand } from "@aws-sdk/client-ecs";
import {
  processImportJob,
  processExtractionRetry,
  processDirectExtraction,
} from "./import-worker.js";
import { processVaultImport } from "../vault/import-worker.js";
import { processVaultExport } from "../vault/export-worker.js";

const STUCK_JOB_THRESHOLD = "1 hour";
const STUCK_JOB_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const DB_POLL_INTERVAL_MS = 30_000;
const IDLE_POLLS_BEFORE_SHUTDOWN = 30; // 30 × 20s = ~10 min idle
const MAX_CONCURRENT_JOBS = 3;

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
  region: process.env.AWS_REGION ?? "eu-north-1",
});
const QUEUE_URL = process.env.SQS_QUEUE_URL;
const RETRY_QUEUE_URL = process.env.SQS_EXTRACT_RETRY_QUEUE_URL;

async function failStuckJobs() {
  const stuck = await sql`
    UPDATE app.canvas_import_jobs
    SET status = 'failed', error_message = 'Job timed out', updated_at = NOW()
    WHERE status = 'processing' AND started_at < NOW() - ${STUCK_JOB_THRESHOLD}::interval
    RETURNING id
  `;
  if (stuck.length > 0) {
    console.log(
      `[${new Date().toISOString()}] Failed ${stuck.length} stuck job(s)`,
    );
  }
}

// DB safety-net: claim orphaned jobs SQS missed
// uses FOR UPDATE SKIP LOCKED so multiple workers don't grab the same job
async function claimOrphanedJobs() {
  const orphaned = await sql`
    SELECT id FROM app.canvas_import_jobs
    WHERE status = 'queued'
      AND created_at < NOW() - INTERVAL '15 seconds'
    ORDER BY created_at
    LIMIT ${MAX_CONCURRENT_JOBS}
    FOR UPDATE SKIP LOCKED
  `;
  if (orphaned.length === 0) return false;

  console.log(
    `[${new Date().toISOString()}] DB poll: found ${orphaned.length} orphaned job(s)`,
  );
  const results = await Promise.allSettled(
    orphaned.map((row) => processImportJob(row.id)),
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

async function pollQueue() {
  const res = await sqsClient.send(
    new ReceiveMessageCommand({
      QueueUrl: QUEUE_URL,
      MaxNumberOfMessages: MAX_CONCURRENT_JOBS,
      WaitTimeSeconds: 20,
      VisibilityTimeout: 3600,
    }),
  );

  const messages = res.Messages ?? [];
  if (messages.length === 0) return false;

  const results = await Promise.allSettled(
    messages.map((m) => processAndDelete(m, QUEUE_URL)),
  );
  for (const r of results) {
    if (r.status === "rejected") {
      console.error(
        `[${new Date().toISOString()}] Job processing error:`,
        r.reason?.message,
      );
    }
  }
  return true;
}

// drains the extraction retry queue (non-blocking, short poll)
async function pollRetryQueue() {
  if (!RETRY_QUEUE_URL) return false;

  const res = await sqsClient.send(
    new ReceiveMessageCommand({
      QueueUrl: RETRY_QUEUE_URL,
      MaxNumberOfMessages: MAX_CONCURRENT_JOBS,
      WaitTimeSeconds: 0, // short poll — don't block the main loop
      VisibilityTimeout: 300,
    }),
  );

  const messages = res.Messages ?? [];
  if (messages.length === 0) return false;

  const results = await Promise.allSettled(
    messages.map((m) => processAndDelete(m, RETRY_QUEUE_URL)),
  );
  for (const r of results) {
    if (r.status === "rejected") {
      console.error(
        `[${new Date().toISOString()}] Retry processing error:`,
        r.reason?.message,
      );
    }
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

while (true) {
  try {
    const hadWork = await pollQueue();
    const hadRetries = await pollRetryQueue();
    idlePolls = hadWork || hadRetries ? 0 : idlePolls + 1;

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
          region: process.env.AWS_REGION ?? "eu-north-1",
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
    await new Promise((r) => setTimeout(r, 5000));
  }
}
