/**
 * SQS polling loop for the Canvas import worker.
 * Run as: node -r ./instrumentation.ts src/lib/canvas/worker-loop.js
 *
 * Polls the SQS queue for import jobs and processes them.
 * Auto-scales down after ~10 min of idle polling.
 */

import sql from '../../database/pgsql.js';
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { ECSClient, UpdateServiceCommand } from '@aws-sdk/client-ecs';
import { processImportJob } from './import-worker.js';

const STUCK_JOB_THRESHOLD = '1 hour';
const STUCK_JOB_CHECK_MS = 5 * 60 * 1000;
const IDLE_POLLS_BEFORE_SHUTDOWN = 30;
const MAX_CONCURRENT_JOBS = 3;

const sqsClient = new SQSClient({ region: process.env.AWS_REGION ?? 'eu-north-1' });
const QUEUE_URL = process.env.SQS_QUEUE_URL;

async function failStuckJobs() {
  await sql`
    UPDATE app.canvas_import_jobs
    SET status = 'failed', error_message = 'Job timed out', updated_at = NOW()
    WHERE status = 'processing' AND started_at < NOW() - ${STUCK_JOB_THRESHOLD}::interval
  `;
}

async function processOrphanedJobs() {
  const orphaned = await sql`
    SELECT id FROM app.canvas_import_jobs
    WHERE status = 'queued' AND created_at < NOW() - INTERVAL '2 minutes'
    ORDER BY created_at ASC LIMIT 3
  `;
  for (const job of orphaned) {
    console.log(`[${new Date().toISOString()}] Processing orphaned job: ${job.id}`);
    await processImportJob(job.id);
  }
  return orphaned.length > 0;
}

async function processAndDelete(message) {
  const body = JSON.parse(message.Body);
  const type = body.type ?? 'canvas-import';
  const ts = () => new Date().toISOString();

  console.log(`[${ts()}] Received ${type}: ${body.jobId ?? body.userId ?? 'unknown'}`);

  switch (type) {
    case 'canvas-import':
      await processImportJob(body.jobId);
      break;
    case 'vault-export':
      console.log(`[${ts()}] vault-export not yet enabled, skipping`);
      break;
    case 'vault-import':
      console.log(`[${ts()}] vault-import not yet enabled, skipping`);
      break;
    default:
      console.warn(`[${ts()}] Unknown job type: ${type}`);
  }

  await sqsClient.send(new DeleteMessageCommand({
    QueueUrl: QUEUE_URL, ReceiptHandle: message.ReceiptHandle,
  }));
  console.log(`[${ts()}] Done, message deleted`);
}

async function pollQueue() {
  const res = await sqsClient.send(new ReceiveMessageCommand({
    QueueUrl: QUEUE_URL,
    MaxNumberOfMessages: MAX_CONCURRENT_JOBS,
    WaitTimeSeconds: 20,
    VisibilityTimeout: 3600,
  }));

  const messages = res.Messages ?? [];
  if (messages.length === 0) return false;

  const results = await Promise.allSettled(messages.map(processAndDelete));
  for (const r of results) {
    if (r.status === 'rejected') {
      console.error(`[${new Date().toISOString()}] Job error:`, r.reason?.message);
    }
  }
  return true;
}

async function scaleDown() {
  const ecsClient = new ECSClient({ region: process.env.AWS_REGION ?? 'eu-north-1' });
  await ecsClient.send(new UpdateServiceCommand({
    cluster: process.env.ECS_CLUSTER ?? 'oghmanotes',
    service: process.env.ECS_SERVICE ?? 'canvas-import-worker',
    desiredCount: 0,
  }));
}

// ── Main loop ───────────────────────────────────────────────────────────────

console.log(`[${new Date().toISOString()}] Canvas Import Worker started (SQS mode)`);

await failStuckJobs();
await processOrphanedJobs();
setInterval(failStuckJobs, STUCK_JOB_CHECK_MS);
setInterval(processOrphanedJobs, STUCK_JOB_CHECK_MS);

let idlePolls = 0;

while (true) {
  try {
    const hadWork = await pollQueue();
    idlePolls = hadWork ? 0 : idlePolls + 1;

    if (idlePolls >= IDLE_POLLS_BEFORE_SHUTDOWN) {
      console.log(`[${new Date().toISOString()}] ${IDLE_POLLS_BEFORE_SHUTDOWN} idle polls (~10 min), scaling down`);
      try { await scaleDown(); } catch (e) {
        console.error(`[${new Date().toISOString()}] Scale-down failed:`, e.message);
      }
      process.exit(0);
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Poll error:`, err.message);
    await new Promise(r => setTimeout(r, 5000));
  }
}
