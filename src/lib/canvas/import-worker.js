/**
 * Canvas Import Worker
 * Processes Canvas file imports in the background.
 * Run as a separate process: node -r ./instrumentation.ts src/lib/canvas/import-worker.js
 *
 * Folder hierarchy created per import:
 *   Course Name/
 *     Module Name/
 *       file.pdf
 *     Assignments/
 *       Assignment Name/
 *         attached-file.pdf
 *
 * This file is the top-level orchestrator. The heavy lifting lives in:
 *   - async-limiter.js     — concurrency primitives (createAsyncLimiter, pooled)
 *   - import-metrics.js    — timing, logging, env-parsing helpers
 *   - import-discovery.js  — two-phase discovery: courses -> modules -> pending files
 *   - import-extraction.js — file download, dedup, import record management
 *   - import-embedding.js  — RAG pipeline: content extraction + embedding storage
 */

import sql from "../../database/pgsql.js";
import { CanvasClient } from "./client.js";
import { pooled } from "./async-limiter.js";
import { parseEnvEnabled } from "./import-metrics.js";
import { parseJobCourses, processCourse } from "./import-discovery.js";
import { decrypt } from "../crypto.ts";
import { getStorageProvider } from "../storage/init.ts";
import { ensureMarkerRunning } from "../marker-ec2.ts";

const CANVAS_PREWARM_MARKER = parseEnvEnabled("CANVAS_PREWARM_MARKER", true);

// ── Legacy single-pass pipeline ─────────────────────────────────────────────
// used by the "canvas-import" SQS message type; kept for in-flight messages
// during the transition to two-phase (discover + per-file) processing.

async function runJobPipeline(jobId, userId, courses) {
  await sql`UPDATE app.canvas_import_jobs SET status = 'processing', started_at = NOW() WHERE id = ${jobId}`;

  if (CANVAS_PREWARM_MARKER) {
    Promise.resolve()
      .then(() => ensureMarkerRunning())
      .then(() => {
        console.log("Marker prewarm complete");
      })
      .catch((error) => {
        console.warn(`Marker prewarm skipped: ${error.message}`);
      });
  }

  const [creds] =
    await sql`SELECT canvas_token, canvas_domain FROM app.login WHERE user_id = ${userId}`;
  if (!creds) throw new Error("User or Canvas credentials not found");
  const plainToken = decrypt(creds.canvas_token, userId);
  const client = new CanvasClient(creds.canvas_domain, plainToken);
  const storage = getStorageProvider();
  const ctx = { client, storage, jobId };
  await pooled(
    courses.map((course) => () => processCourse(course, userId, ctx)),
    3,
  );
}

// ── Job entry point (legacy single-pass) ────────────────────────────────────

export async function processImportJob(jobId) {
  console.log(`[${new Date().toISOString()}] Processing import job: ${jobId}`);
  try {
    const [job] =
      await sql`SELECT * FROM app.canvas_import_jobs WHERE id = ${jobId}`;
    if (!job) {
      console.error(`Job not found: ${jobId}`);
      return false;
    }
    if (job.status === "cancelled") {
      console.log(`Job ${jobId} was cancelled`);
      return false;
    }
    if (job.status !== "queued" && job.status !== "processing") {
      console.log(`Job ${jobId} already in terminal state: ${job.status}`);
      return false;
    }
    await runJobPipeline(jobId, job.user_id, parseJobCourses(job));

    // seed initial quiz questions from newly imported chunks (non-fatal)
    try {
      const chunks = await sql`
        SELECT c.id FROM app.chunks c
        JOIN app.canvas_imports ci ON ci.note_id = c.document_id
        WHERE ci.job_id = ${jobId}::uuid AND c.user_id = ${job.user_id}::uuid
      `;
      const chunkIds = chunks.map((r) => r.id);
      if (chunkIds.length > 0) {
        const { seedQuestionsAfterImport } =
          await import("../quiz/generate-background.ts");
        const seeded = await seedQuestionsAfterImport(job.user_id, chunkIds, 5);
        console.log(
          `Quiz seed: ${seeded} questions generated for job ${jobId}`,
        );
      }
    } catch (seedErr) {
      console.warn(`Quiz seed failed (non-fatal): ${seedErr.message}`);
    }

    await sql`UPDATE app.canvas_import_jobs SET status = 'complete', completed_at = NOW() WHERE id = ${jobId}`;
    console.log(`Job completed: ${jobId}`);
    return true;
  } catch (error) {
    console.error(`Job failed: ${jobId}`, error);
    await sql`UPDATE app.canvas_import_jobs SET status = 'failed', error_message = ${error.message}, updated_at = NOW() WHERE id = ${jobId}`;
    return false;
  }
}

// ── Re-exports for worker-entry.js ──────────────────────────────────────────

export { processDiscoverJob } from "./import-discovery.js";
export { processCanvasFile, processDirectExtraction, processExtractionRetry, processMarkerComplete } from "./import-extraction.js";
