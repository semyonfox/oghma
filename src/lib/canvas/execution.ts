import { AsyncLocalStorage } from "node:async_hooks";
import type postgres from "postgres";
import sql, { withDatabaseTransaction } from "@/database/pgsql";

export interface CanvasExecution {
  jobId: string;
  userId: string;
  token: string;
  importId?: string;
  markerId?: string;
  markerAttempt?: number;
}

export class CanvasClaimLostError extends Error {
  constructor() { super("Canvas execution no longer owns this work"); }
}

const execution = new AsyncLocalStorage<CanvasExecution>();
const publication = new AsyncLocalStorage<CanvasExecution>();
export const CANVAS_CLAIM_SECONDS = 300;

export function currentCanvasExecution() { return execution.getStore(); }

export async function withCanvasExecution<T>(owner: CanvasExecution, work: () => Promise<T>) {
  return execution.run(owner, async () => {
    let renewing = false;
    const heartbeat = setInterval(() => {
      if (renewing) return;
      renewing = true;
      void renewCanvasExecution(owner).catch(() => {
        // Publication checks the durable owner again; a heartbeat failure
        // never grants permission to continue writing.
        console.warn("Canvas execution heartbeat failed", { jobId: owner.jobId });
      }).finally(() => { renewing = false; });
    }, 30_000);
    try { return await work(); } finally { clearInterval(heartbeat); }
  });
}

async function renewCanvasExecution(owner: CanvasExecution) {
  if (owner.importId) {
    await sql`
      UPDATE app.canvas_imports SET claim_expires_at = NOW() + ${CANVAS_CLAIM_SECONDS} * INTERVAL '1 second', updated_at = NOW()
      WHERE id = ${owner.importId}::uuid AND job_id = ${owner.jobId}::uuid
        AND user_id = ${owner.userId}::uuid AND claim_token = ${owner.token}::uuid
        AND status IN ('downloading', 'processing', 'indexing')
    `;
  } else {
    await sql`
      UPDATE app.canvas_import_jobs SET claim_expires_at = NOW() + ${CANVAS_CLAIM_SECONDS} * INTERVAL '1 second', updated_at = NOW()
      WHERE id = ${owner.jobId}::uuid AND user_id = ${owner.userId}::uuid
        AND claim_token = ${owner.token}::uuid AND status = 'discovering'
    `;
  }
}

export async function assertCanvasExecution(tx: postgres.TransactionSql, owner: CanvasExecution) {
  // Tree -> parent job -> import is also used by Stop/replacement. Holding
  // these locks through publication makes recovery/cancellation wait for a
  // publication already accepted, or reject it before it starts.
  await tx`SELECT pg_advisory_xact_lock(hashtextextended(${owner.userId}::text, 0))`;
  if (owner.markerId) {
    if (owner.jobId) {
      const [parent] = await tx`SELECT id FROM app.canvas_import_jobs
        WHERE id = ${owner.jobId}::uuid AND status = 'processing' FOR SHARE`;
      if (!parent) throw new CanvasClaimLostError();
    }
    const [marker] = await tx`SELECT callback_id FROM app.marker_jobs
      WHERE callback_id = ${owner.markerId}::uuid AND user_id = ${owner.userId}::uuid
        AND status = 'completing' AND completion_attempts = ${owner.markerAttempt ?? null}
      FOR UPDATE`;
    if (!marker) throw new CanvasClaimLostError();
    return;
  }
  const [job] = await tx`
    SELECT id FROM app.canvas_import_jobs
    WHERE id = ${owner.jobId}::uuid AND user_id = ${owner.userId}::uuid AND type = 'canvas'
      AND status = ${owner.importId ? "processing" : "discovering"}
      AND (${Boolean(owner.importId)} OR claim_token = ${owner.token}::uuid)
    FOR SHARE
  `;
  if (!job) throw new CanvasClaimLostError();
  if (owner.importId) {
    const [file] = await tx`
      SELECT id FROM app.canvas_imports
      WHERE id = ${owner.importId}::uuid AND job_id = ${owner.jobId}::uuid
        AND user_id = ${owner.userId}::uuid AND claim_token = ${owner.token}::uuid
        AND status IN ('downloading', 'processing', 'indexing')
      FOR UPDATE
    `;
    if (!file) throw new CanvasClaimLostError();
  }
}

export function withCanvasMarkerPublication<T>(
  owner: CanvasExecution, work: () => Promise<T>,
): Promise<T> {
  return execution.run(owner, () => withCanvasPublication(work));
}

/** Only publication is transactional; downloads/OCR stay outside the locks. */
export async function withCanvasPublication<T>(work: () => Promise<T>): Promise<T> {
  const owner = execution.getStore();
  const active = publication.getStore();
  if (active && active !== owner) throw new CanvasClaimLostError();
  if (!owner || active) return work();
  return withDatabaseTransaction(async (tx) => {
    await assertCanvasExecution(tx, owner);
    // Remote publication has its own request timeout. Idle-in-transaction
    // expiry must not silently release the claim while that request runs.
    await tx`SET LOCAL idle_in_transaction_session_timeout = 0`;
    return publication.run(owner, work);
  });
}
