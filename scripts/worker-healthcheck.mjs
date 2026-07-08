#!/usr/bin/env node

import sql from "../src/database/pgsql.js";
import {
  CANVAS_IMPORT_QUEUE,
  EXTRACT_RETRY_QUEUE,
  getQueueConnection,
  getQueueProvider,
} from "../src/lib/queue.ts";
import { Queue } from "bullmq";

function requireEnv(name) {
  if (!process.env[name]) {
    throw new Error(`${name} is required`);
  }
}

async function checkDatabase() {
  await sql`SELECT 1`;
}

async function checkBullMq() {
  const connection = getQueueConnection();
  const canvasQueue = new Queue(CANVAS_IMPORT_QUEUE, { connection });
  const retryQueue = new Queue(EXTRACT_RETRY_QUEUE, { connection });
  try {
    const pong = await connection.ping();
    if (pong !== "PONG") {
      throw new Error(`Redis ping returned ${pong}`);
    }

    await Promise.all([
      canvasQueue.waitUntilReady(),
      retryQueue.waitUntilReady(),
    ]);
    await Promise.all([
      canvasQueue.getJobCounts("waiting", "active", "delayed"),
      retryQueue.getJobCounts("waiting", "active", "delayed"),
    ]);
    console.log(
      `[worker-healthcheck] BullMQ ready: ${CANVAS_IMPORT_QUEUE}, ${EXTRACT_RETRY_QUEUE}`,
    );
  } finally {
    await Promise.allSettled([
      canvasQueue.close(),
      retryQueue.close(),
      connection.quit(),
    ]);
  }
}

function checkCloudflareQueueConfig() {
  requireEnv("CLOUDFLARE_ACCOUNT_ID");
  requireEnv("CLOUDFLARE_QUEUES_API_TOKEN");
  requireEnv("CLOUDFLARE_CANVAS_IMPORT_QUEUE_ID");
  requireEnv("CLOUDFLARE_EXTRACT_RETRY_QUEUE_ID");
  console.log("[worker-healthcheck] Cloudflare queue config present");
}

try {
  const provider = getQueueProvider();
  await checkDatabase();
  if (provider === "bullmq") {
    await checkBullMq();
  } else {
    checkCloudflareQueueConfig();
  }
  console.log(`[worker-healthcheck] ok (${provider})`);
} catch (err) {
  console.error("[worker-healthcheck] failed:", err?.message ?? err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
