import type postgres from "postgres";
import { NextResponse } from "next/server";
import { withErrorHandler, requireAuth } from "@/lib/api-error";
import { checkRateLimit } from "@/lib/rate-limiter";
import { cancelActiveCanvasImportJobs } from "@/lib/canvas/cancel-import-jobs";
import {
  permanentlyDeleteNotes,
  queueVaultStorageCleanup,
  type VaultCleanupJob,
} from "@/lib/notes/storage/note-lifecycle";
import sql from "@/database/pgsql";

/**
 * DELETE /api/vault
 *
 * Clear Vault deliberately bypasses the 30-day Trash. It first fences all
 * running imports, then uses the same durable permanent-delete path as Empty
 * Trash. Private object/vector cleanup is retried by the worker if an external
 * provider is temporarily unavailable; shared import-cache objects are only
 * collected later by their reference-aware retention job.
 */
export const DELETE = withErrorHandler(async () => {
  const clearedAt = new Date();
  const user = await requireAuth();
  const limited = await checkRateLimit("vault-delete", user.user_id);
  if (limited) return limited;

  const snapshot = await sql.begin(async (tx: postgres.TransactionSql) => {
    await cancelActiveCanvasImportJobs(
      tx,
      user.user_id,
      "Vault permanently cleared by user",
    );
    const jobs = await tx<VaultCleanupJob[]>`
      SELECT id, type, input_s3_key
      FROM app.canvas_import_jobs
      WHERE user_id = ${user.user_id}::uuid
      FOR UPDATE
    `;
    const imports = await tx<Array<{ id: string }>>`
      SELECT id FROM app.canvas_imports
      WHERE user_id = ${user.user_id}::uuid
      FOR UPDATE
    `;
    // Vault imports are not covered by the Canvas-only helper above. Fence
    // every active job before any notes are removed so late workers cannot
    // recreate data after a clear.
    await tx`
      UPDATE app.canvas_import_jobs
      SET status = 'cancelled', completed_at = NOW(), updated_at = NOW()
      WHERE user_id = ${user.user_id}::uuid
        AND id = ANY(${jobs.map((job) => job.id)}::uuid[])
        AND status IN ('queued', 'discovering', 'processing')
    `;
    const notes = await tx<Array<{ note_id: string }>>`
      SELECT note_id FROM app.notes
      WHERE user_id = ${user.user_id}::uuid
    `;
    return {
      jobs,
      importIds: imports.map((row) => row.id),
      noteIds: notes.map((row) => row.note_id),
    };
  });

  const result = await permanentlyDeleteNotes(user.user_id, snapshot.noteIds);
  const vaultStorageCleanupPending = await queueVaultStorageCleanup(
    user.user_id,
    snapshot.jobs,
    clearedAt,
  );

  // A cancelled job can have discovery rows without a note yet. They are not
  // a Trash item, so Clear Vault removes them immediately too.
  const { importsResult, jobsResult } = await sql.begin(async (tx: postgres.TransactionSql) => {
    const importsResult = await tx`
      DELETE FROM app.canvas_imports
      WHERE user_id = ${user.user_id}::uuid
        AND id = ANY(${snapshot.importIds}::uuid[])
        AND (job_id IS NULL OR job_id = ANY(${snapshot.jobs.map((job) => job.id)}::uuid[]))
      RETURNING id
    `;
    const jobsResult = await tx`
      DELETE FROM app.canvas_import_jobs
      WHERE user_id = ${user.user_id}::uuid
        AND id = ANY(${snapshot.jobs.map((job) => job.id)}::uuid[])
      RETURNING id
    `;
    return { importsResult, jobsResult };
  });

  return NextResponse.json({
    success: true,
    summary: {
      notesDeleted: result.noteIds.length,
      // Kept for the settings UI's existing contract. A non-zero cleanup task
      // means these keys were queued and may be retried rather than silently
      // abandoned if S3/Qdrant was unavailable.
      s3FilesDeleted: result.objectKeys,
      cleanupPending: Boolean(result.cleanupTaskId) || vaultStorageCleanupPending,
      canvasImportsDeleted: importsResult.length,
      canvasJobsDeleted: jobsResult.length,
    },
  });
});
