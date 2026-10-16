import sql from "@/database/pgsql";

export const VAULT_JOB_TYPES = ["vault-import", "vault-export"] as const;
export type VaultJobType = (typeof VAULT_JOB_TYPES)[number];

export function isVaultJobType(value: unknown): value is VaultJobType {
  return VAULT_JOB_TYPES.some((type) => type === value);
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

export const STALE_VAULT_JOB_MESSAGE =
  "This job stopped responding. Please start it again.";

/**
 * Workers heartbeat after every file, so a processing job that has been quiet
 * this long lost its worker (deploys replace the container). Vault jobs are
 * single-attempt and nothing else would ever move them out of processing,
 * which would block the user's next job of that type forever. Queued jobs get
 * longer because they may legitimately wait behind a busy queue.
 */
export async function expireStaleVaultJobs(userId?: string): Promise<number> {
  const rows = await sql<{ id: string }[]>`
    UPDATE app.canvas_import_jobs
    SET status = CASE WHEN cancel_requested_at IS NULL THEN 'failed' ELSE 'cancelled' END,
        error_message = CASE WHEN cancel_requested_at IS NULL THEN ${STALE_VAULT_JOB_MESSAGE} ELSE error_message END,
        completed_at = NOW(),
        updated_at = NOW()
    WHERE type IN ('vault-import', 'vault-export')
      AND ${userId ? sql`user_id = ${userId}::uuid` : sql`TRUE`}
      AND (
        (status = 'processing' AND updated_at < NOW() - INTERVAL '30 minutes')
        OR (status = 'queued' AND updated_at < NOW() - INTERVAL '2 hours')
      )
    RETURNING id
  `;
  return rows.length;
}

export async function findActiveVaultJob(
  userId: string,
  type: VaultJobType,
): Promise<string | null> {
  const [row] = await sql<{ id: string }[]>`
    SELECT id FROM app.canvas_import_jobs
    WHERE user_id = ${userId}::uuid
      AND type = ${type}
      AND status IN ('queued', 'processing')
    LIMIT 1
  `;
  return row?.id ?? null;
}

export type VaultJobHeartbeat = "active" | "cancel-requested" | "gone";

/**
 * Record progress and tell the worker whether to keep going. A missing row
 * means Clear Vault deleted the job or it was replaced, failed or cancelled,
 * so the worker must stop either way.
 */
export async function heartbeatVaultJob(
  jobId: string,
  userId: string,
  processedFiles: number,
): Promise<VaultJobHeartbeat> {
  const [row] = await sql<{ cancel_requested_at: Date | string | null }[]>`
    UPDATE app.canvas_import_jobs
    SET processed_files = ${processedFiles}, updated_at = NOW()
    WHERE id = ${jobId}::uuid
      AND user_id = ${userId}::uuid
      AND status = 'processing'
    RETURNING cancel_requested_at
  `;
  if (!row) return "gone";
  return row.cancel_requested_at ? "cancel-requested" : "active";
}

export async function markVaultJobCancelled(
  jobId: string,
  processedFiles: number,
): Promise<void> {
  await sql`
    UPDATE app.canvas_import_jobs
    SET status = 'cancelled', completed_at = NOW(), processed_files = ${processedFiles}, updated_at = NOW()
    WHERE id = ${jobId}::uuid AND status = 'processing'
  `;
}

export async function markVaultJobFailed(
  jobId: string,
  message: string,
): Promise<void> {
  await sql`
    UPDATE app.canvas_import_jobs
    SET status = 'failed', error_message = ${message}, completed_at = NOW(), updated_at = NOW()
    WHERE id = ${jobId}::uuid AND status = 'processing'
  `;
}
