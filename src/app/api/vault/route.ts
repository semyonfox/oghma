import { NextResponse } from "next/server";
import { withErrorHandler, requireAuth } from "@/lib/api-error";
import { checkRateLimit } from "@/lib/rateLimiter";
import { cancelActiveCanvasImportJobs } from "@/lib/canvas/cancel-import-jobs";
import {
  permanentlyDeleteAllUserNotes,
  queueVaultStorageCleanup,
} from "@/lib/notes/storage/note-lifecycle";
import sql from "@/database/pgsql.js";

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
  const user = await requireAuth();
  const limited = await checkRateLimit("vault-delete", user.user_id);
  if (limited) return limited;

  await sql.begin(async (tx: any) => {
    await cancelActiveCanvasImportJobs(
      tx,
      user.user_id,
      "Vault permanently cleared by user",
    );
    // Vault imports are not covered by the Canvas-only helper above. Fence
    // every active job before any notes are removed so late workers cannot
    // recreate data after a clear.
    await tx`
      UPDATE app.canvas_import_jobs
      SET status = 'cancelled', completed_at = NOW(), updated_at = NOW()
      WHERE user_id = ${user.user_id}::uuid
        AND status IN ('queued', 'discovering', 'processing')
    `;
  });

  const result = await permanentlyDeleteAllUserNotes(user.user_id);
  const vaultStorageCleanupPending = await queueVaultStorageCleanup(
    user.user_id,
  );

  // A cancelled job can have discovery rows without a note yet. They are not
  // a Trash item, so Clear Vault removes them immediately too.
  const [importsResult, jobsResult] = await Promise.all([
    sql`
      DELETE FROM app.canvas_imports
      WHERE user_id = ${user.user_id}::uuid
      RETURNING id
    `,
    sql`
      DELETE FROM app.canvas_import_jobs
      WHERE user_id = ${user.user_id}::uuid
      RETURNING id
    `,
  ]);

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
