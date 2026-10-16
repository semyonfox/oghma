import type postgres from "postgres";
import { cancelActiveCanvasImportJobs } from "@/lib/canvas/cancel-import-jobs";

const DEACTIVATED_REASON = "Account deactivated";

export interface CancelledUserJobs {
  canvasJobs: number;
  studyJobs: number;
}

/**
 * Stops queued background work for an account that is being deactivated.
 * Runs in the caller's transaction so the account flag and the cancellation
 * commit together; the dispatchers also skip inactive accounts, so work queued
 * after this point never starts either.
 *
 * study_jobs has no cancelled state, so pending and running jobs are failed.
 * A running job loses its lease and its final fenced write matches nothing.
 */
export async function cancelUserJobs(
  tx: postgres.TransactionSql,
  userId: string,
): Promise<CancelledUserJobs> {
  const canvas = await cancelActiveCanvasImportJobs(tx, userId, DEACTIVATED_REASON);
  const study = await tx<{ id: string }[]>`
    UPDATE app.study_jobs
    SET state = 'failed', error = ${DEACTIVATED_REASON},
        lease_until = NULL, lease_token = NULL, updated_at = NOW()
    WHERE user_id = ${userId}::uuid AND state IN ('pending', 'running')
    RETURNING id
  `;
  return { canvasJobs: canvas.length, studyJobs: study.length };
}
