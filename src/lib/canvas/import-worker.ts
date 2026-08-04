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
import { parseJobCourses, processCourse } from "./import-discovery.js";
import { checkAndCompleteJob } from "./import-extraction.js";
import { decrypt } from "../crypto.ts";
import { getStorageProvider } from "../storage/init.ts";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ── Legacy single-pass pipeline ─────────────────────────────────────────────
// used by the "canvas-import" message type; kept for in-flight messages
// during the transition to two-phase (discover + per-file) processing.

async function runJobPipeline(
  jobId: string,
  userId: string,
  courses: Array<unknown>,
): Promise<void> {
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

export async function processImportJob(jobId: string): Promise<boolean> {
  console.log(`[${new Date().toISOString()}] Processing import job: ${jobId}`);
  let job:
    | { id: string; user_id: string; course_ids: string | Array<unknown> }
    | undefined;
  try {
    // This legacy message type is still at-least-once. Claim only a queued
    // Canvas generation; a duplicate or cancellation must not run a second
    // full course walk just because its stale queue payload arrived late.
    [job] = await sql`
      UPDATE app.canvas_import_jobs
      SET status = 'processing',
          started_at = COALESCE(started_at, NOW()),
          error_message = NULL,
          updated_at = NOW()
      WHERE id = ${jobId}::uuid
        AND type = 'canvas'
        AND status = 'queued'
      RETURNING *
    `;
    if (!job) {
      console.log(`Job ${jobId} is already claimed, terminal, cancelled, or missing`);
      return false;
    }
    await runJobPipeline(jobId, job.user_id, parseJobCourses(job));

    const completed = await checkAndCompleteJob(jobId, job.user_id);
    if (!completed) {
      console.log(`Job ${jobId} remains active while file work or Marker completion is pending`);
      return true;
    }

    console.log(`Job completed: ${jobId}`);
    return true;
  } catch (error) {
    console.error(`Job failed: ${jobId}`, error);
    await sql`
      UPDATE app.canvas_import_jobs
      SET status = 'failed', error_message = ${errorMessage(error)}, updated_at = NOW()
      WHERE id = ${jobId}::uuid
        AND type = 'canvas'
        AND status = 'processing'
    `;
    return false;
  }
}

// ── Re-exports for worker-entry.js ──────────────────────────────────────────

export { processDiscoverJob } from "./import-discovery.js";
export {
  processCanvasFile,
  processDirectExtraction,
  processExtractionRetry,
  recoverPendingExtractionRetries,
  processMarkerComplete,
  processMarkerFailed,
} from "./import-extraction.js";
