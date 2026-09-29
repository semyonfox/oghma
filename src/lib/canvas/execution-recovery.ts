import sql from "@/database/pgsql";
import { getCanvasQueueAttemptLimit } from "@/lib/queue";

type Candidate = { id: string; user_id: string; job_id: string; kind: "file" | "discovery" };

/** Observation is the rollout default, not permission to reclaim old writers. */
export async function recoverCanvasExecutions(
  apply = process.env.CANVAS_CLAIM_RECOVERY === "enabled", limit = 50,
): Promise<string[]> {
  const candidates = await sql<Candidate[]>`
    SELECT child.id, child.user_id, child.job_id, 'file' AS kind FROM app.canvas_imports child
    JOIN app.canvas_import_jobs parent ON parent.id = child.job_id
    WHERE (child.status IN ('downloading', 'processing', 'indexing')
      AND (child.claim_expires_at < NOW() OR (child.claim_token IS NULL AND child.updated_at < NOW() - INTERVAL '1 hour')))
      OR (parent.status IN ('complete', 'failed', 'cancelled')
        AND child.status IN ('pending', 'downloading', 'processing', 'pending_extract', 'indexing', 'pending_retry', 'pending_marker', 'pending_cache'))
      OR (child.status = 'pending_retry' AND child.updated_at < NOW() - INTERVAL '1 minute'
        AND (child.next_attempt_at IS NULL OR child.retry_attempts >= 4 OR child.source_s3_key IS NULL))
    UNION ALL
    SELECT id, user_id, id AS job_id, 'discovery' AS kind FROM app.canvas_import_jobs
    WHERE type = 'canvas' AND status = 'discovering'
      AND (claim_expires_at < NOW() OR (claim_token IS NULL AND updated_at < NOW() - INTERVAL '1 hour'))
    LIMIT ${limit}
  `;
  if (candidates.length) console.info("canvas-expired-executions", { count: candidates.length, apply });
  if (!apply) return [];
  const affected = new Set<string>();
  for (const candidate of candidates) {
    const recovered = await sql.begin(async (tx) => {
      // Do not wait behind a live publication holding the tree fence.
      const [lock] = await tx<{ acquired: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtextextended(${candidate.user_id}::text, 0)) AS acquired
      `;
      if (!lock.acquired) return false;
      const [job] = await tx<{ status: string }[]>`
        SELECT status FROM app.canvas_import_jobs WHERE id = ${candidate.job_id}::uuid
        FOR UPDATE SKIP LOCKED
      `;
      if (!job) return false;
      if (candidate.kind === "discovery") {
        const [changed] = await tx<{ status: string }[]>`
          UPDATE app.canvas_import_jobs SET
            status = CASE WHEN execution_attempts < ${getCanvasQueueAttemptLimit()} THEN 'queued' ELSE 'failed' END,
            claim_token = NULL, claim_expires_at = NULL, updated_at = NOW(),
            error_message = 'Discovery worker stopped responding'
          WHERE id = ${candidate.id}::uuid AND status = 'discovering'
            AND (claim_expires_at < NOW() OR (claim_token IS NULL AND updated_at < NOW() - INTERVAL '1 hour'))
          RETURNING status
        `;
        if (changed?.status === "queued") {
          await tx`
            UPDATE app.canvas_imports SET
              status = CASE
                WHEN status = 'indexing' AND retry_attempts >= 4 THEN 'error'
                WHEN status = 'indexing' AND retry_attempts > 0
                  AND source_s3_key IS NOT NULL THEN 'pending_retry'
                WHEN status = 'indexing' AND source_s3_key IS NOT NULL THEN 'pending_extract'
                ELSE 'pending'
              END,
              claim_token = NULL, claim_expires_at = NULL, dispatched_at = NULL,
              next_attempt_at = CASE
                WHEN status = 'indexing' AND retry_attempts >= 4 THEN NULL ELSE NOW()
              END,
              retry_seq = retry_seq + 1,
              retryable = retryable OR (status = 'indexing' AND retry_attempts >= 4),
              error_message = CASE
                WHEN status = 'indexing' AND retry_attempts >= 4
                  THEN 'Extraction retry budget exhausted'
                ELSE error_message
              END,
              updated_at = NOW()
            WHERE job_id = ${candidate.id}::uuid
              AND status IN ('downloading', 'processing', 'indexing')
          `;
        }
        if (changed?.status === "failed") {
          await tx`
            UPDATE app.marker_jobs SET status = 'cancelled', error = 'Parent discovery failed',
              completed_at = NOW(), updated_at = NOW()
            WHERE canvas_job_id = ${candidate.id}::uuid
              AND status NOT IN ('completed', 'failed', 'invalid_result', 'cancelled')
          `;
          await tx`
            UPDATE app.canvas_imports SET status = 'error', retryable = TRUE,
              claim_token = NULL, claim_expires_at = NULL, dispatched_at = NULL,
              next_attempt_at = NULL, error_message = 'Discovery did not finish', updated_at = NOW()
            WHERE job_id = ${candidate.id}::uuid
              AND status NOT IN ('complete', 'forbidden', 'error', 'cancelled')
          `;
        }
        return Boolean(changed);
      }
      // discovery can be requeued after files have already started
      const activeJob = ["queued", "discovering", "processing"].includes(job.status);
      if (!activeJob) await tx`
        UPDATE app.marker_jobs SET status = 'cancelled', error = 'Parent import is terminal', updated_at = NOW()
        WHERE canvas_job_id = ${candidate.job_id}::uuid
          AND status NOT IN ('completed', 'failed', 'invalid_result', 'cancelled')
      `;
      const changed = await tx`
        UPDATE app.canvas_imports SET
          status = CASE WHEN ${job.status === "cancelled"} THEN 'cancelled'
            WHEN ${activeJob} AND retry_attempts >= 4 AND status IN ('indexing', 'pending_retry') THEN 'error'
            WHEN ${activeJob} AND retry_attempts > 0 AND retry_attempts < 4
              AND status = 'indexing' AND source_s3_key IS NOT NULL THEN 'pending_retry'
            WHEN ${activeJob} AND status = 'pending_retry' AND retry_attempts < 4
              AND source_s3_key IS NOT NULL THEN 'pending_retry'
            WHEN ${activeJob} AND status = 'indexing' AND source_s3_key IS NOT NULL THEN 'pending_extract'
            WHEN ${activeJob} AND execution_attempts < ${getCanvasQueueAttemptLimit()}
            THEN 'pending' ELSE 'error' END,
          claim_token = NULL, claim_expires_at = NULL, dispatched_at = NULL,
          next_attempt_at = NOW(), retry_seq = retry_seq + 1, retryable = ${job.status !== "cancelled"},
          error_message = 'Worker stopped responding', updated_at = NOW()
        WHERE id = ${candidate.id}::uuid AND job_id = ${candidate.job_id}::uuid
          AND ((status IN ('downloading', 'processing', 'indexing')
            AND (claim_expires_at < NOW() OR (claim_token IS NULL AND updated_at < NOW() - INTERVAL '1 hour')))
            OR (${["complete", "failed", "cancelled"].includes(job.status)}
              AND status IN ('pending', 'downloading', 'processing', 'pending_extract', 'indexing', 'pending_retry', 'pending_marker', 'pending_cache'))
            OR (status = 'pending_retry' AND updated_at < NOW() - INTERVAL '1 minute'
              AND (next_attempt_at IS NULL OR retry_attempts >= 4 OR source_s3_key IS NULL)))
        RETURNING id
      `;
      return changed.length > 0;
    });
    if (recovered) affected.add(candidate.job_id);
  }
  return [...affected];
}
