import { NextResponse } from "next/server";
import { withErrorHandler, requireAuth } from "@/lib/api-error";
import sql from "@/database/pgsql.js";
import { enqueueCanvasJob } from "@/lib/queue";

/**
 * POST /api/vault/export
 *
 * Creates a vault-export job and dispatches to SQS.
 * Response: { jobId }
 */
export const POST = withErrorHandler(async () => {
  const user = await requireAuth();

  // cancel any existing active export jobs
  const job = await sql.begin(async (tx: any) => {
    await tx`
      UPDATE app.canvas_import_jobs
      SET status = 'cancelled', completed_at = NOW()
      WHERE user_id = ${user.user_id}
        AND type = 'vault-export'
        AND status IN ('queued', 'processing')
    `;
    const [inserted] = await tx`
      INSERT INTO app.canvas_import_jobs (user_id, type, status)
      VALUES (${user.user_id}::uuid, 'vault-export', 'queued')
      RETURNING id
    `;
    return inserted;
  });

  const jobId = job.id;

  try {
    await enqueueCanvasJob("vault-export", {
      jobId,
      userId: user.user_id,
    });
  } catch (queueErr) {
    console.error(
      "queue enqueue failed for vault export:",
      (queueErr as Error).message,
    );
  }

  return NextResponse.json({ jobId });
});
