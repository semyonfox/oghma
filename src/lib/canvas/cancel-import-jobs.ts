/**
 * Cancels active Canvas jobs and their downstream work inside the caller's
 * transaction. GPU work that has already begun cannot be unsent, but its
 * durable result is prevented from being indexed after cancellation.
 */
export async function cancelActiveCanvasImportJobs(
  tx: any,
  userId: string,
  reason: string,
): Promise<Array<{ id: string }>> {
  // Serialize import/sync replacement and DELETE for this user. The lock is
  // deliberately scoped to Canvas; Vault jobs share the table but not this
  // lifecycle.
  await tx`
    SELECT pg_advisory_xact_lock(hashtext(${`oghma-canvas-import:${userId}`}))
  `;
  const cancelled = await tx`
    UPDATE app.canvas_import_jobs
    SET status = 'cancelled', completed_at = NOW(), updated_at = NOW()
    WHERE user_id = ${userId}::uuid
      AND type = 'canvas'
      AND status IN ('queued', 'discovering', 'processing')
    RETURNING id
  `;
  const jobIds = cancelled.map((job: { id: string }) => job.id);
  if (jobIds.length === 0) return [];

  // Lock and cancel Marker work before its Canvas rows. Completion and
  // failure finalizers claim Marker first too, so either cancellation wins
  // before indexing begins or the already-finalized result wins coherently.
  await tx`
    UPDATE app.marker_jobs
    SET status = 'cancelled', error = ${reason}, completed_at = NOW(), updated_at = NOW()
    WHERE canvas_job_id = ANY(${jobIds}::uuid[])
      AND status NOT IN ('completed', 'failed', 'invalid_result', 'cancelled')
  `;
  await tx`
    UPDATE app.canvas_imports
    SET status = 'cancelled', error_message = ${reason}, updated_at = NOW()
    WHERE job_id = ANY(${jobIds}::uuid[])
      AND status IN (
        'pending', 'downloading', 'processing', 'indexing', 'pending_retry',
        'pending_marker'
      )
  `;
  await tx`
    UPDATE app.ingestion_jobs AS ingestion
    SET status = 'cancelled', error = ${reason}, updated_at = NOW()
    FROM app.canvas_imports AS imported
    WHERE imported.job_id = ANY(${jobIds}::uuid[])
      AND imported.status = 'cancelled'
      AND imported.note_id = ingestion.note_id
      AND imported.user_id = ingestion.user_id
      AND ingestion.status NOT IN ('done', 'failed', 'cancelled')
  `;
  return cancelled as Array<{ id: string }>;
}
