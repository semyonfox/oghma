import { enqueueExtractRetryJob } from "@/lib/queue";
import sql from "@/database/pgsql";
import { CanvasClaimLostError, currentCanvasExecution, withCanvasPublication } from "./execution";

const RETRY_DELAYS = [30, 120, 480, 900] as const;

export const MAX_EXTRACTION_RETRIES = RETRY_DELAYS.length;

export interface ExtractionRetryMessage {
  noteId: string;
  userId: string;
  s3Key: string | null;
  filename: string;
  mimeType: string;
  parentFolderId: string | null;
  attempt: number;
  // Canvas retries bind their delivery to one durable file generation. Direct
  // extraction retries intentionally omit these fields.
  importRecordId?: string | null;
  jobId?: string | null;
  retrySeq?: number;
}

/** Commit the retry intent before publication; the DB poll repairs send loss. */
export async function stageCanvasExtractionRetry(msg: ExtractionRetryMessage, error: string) {
  const owner = currentCanvasExecution();
  if (!owner || owner.importId !== msg.importRecordId || owner.jobId !== msg.jobId || owner.userId !== msg.userId) {
    throw new CanvasClaimLostError();
  }
  const [staged] = await withCanvasPublication(async () => {
    const rows = await sql<{
    retry_seq: number; retry_attempts: number; next_attempt_at: Date | string; status: string;
  }[]>`
    UPDATE app.canvas_imports
    SET status = CASE WHEN retry_attempts < ${MAX_EXTRACTION_RETRIES} THEN 'pending_retry' ELSE 'error' END,
        retry_seq = retry_seq + 1,
        next_attempt_at = NOW() + (CASE retry_attempts
          WHEN 0 THEN 30 WHEN 1 THEN 120 WHEN 2 THEN 480 ELSE 900 END) * INTERVAL '1 second',
        claim_token = NULL, claim_expires_at = NULL,
        retryable = TRUE, error_message = ${error}, updated_at = NOW()
    WHERE id = ${msg.importRecordId ?? null}::uuid AND job_id = ${msg.jobId ?? null}::uuid
      AND claim_token = ${owner.token}::uuid
      AND user_id = ${msg.userId}::uuid AND status IN ('downloading', 'processing', 'indexing')
    RETURNING retry_seq, retry_attempts, next_attempt_at, status
  `;
    if (rows[0]) await sql`UPDATE app.ingestion_jobs
      SET status = ${rows[0].status === "error" ? "failed" : "pending"}, error = ${error}, updated_at = NOW()
      WHERE note_id = ${msg.noteId}::uuid AND user_id = ${msg.userId}::uuid
        AND status NOT IN ('done', 'cancelled')`;
    return rows;
  });
  if (!staged || staged.status === "error") return;
  await enqueueExtractRetryJob({ ...msg, attempt: staged.retry_attempts + 1, retrySeq: staged.retry_seq },
    Math.max(0, Math.ceil((new Date(staged.next_attempt_at).getTime() - Date.now()) / 1000)))
    .catch(() => console.warn("Canvas retry publication deferred to database recovery", { jobId: msg.jobId }));
}

function getExtractionRetryDelaySeconds(attempt: number): number {
  return RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
}

export async function enqueueExtractionRetry(
  msg: ExtractionRetryMessage,
): Promise<{ delaySeconds: number }> {
  const delaySeconds = getExtractionRetryDelaySeconds(msg.attempt);
  await enqueueExtractRetryJob(
    { ...msg, attempt: msg.attempt + 1 },
    delaySeconds,
  );
  return { delaySeconds };
}
