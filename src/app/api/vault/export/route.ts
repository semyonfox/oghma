import { NextResponse } from "next/server";
import { withErrorHandler, requireAuth } from "@/lib/api-error";
import sql from "@/database/pgsql.js";
import { enqueueCanvasJob } from "@/lib/queue";

/**
 * POST /api/vault/export
 *
 * Creates a vault-export job and dispatches to SQS.
 * Returns 409 if an active export already exists; pass ?force=true to cancel and replace.
 * Response: { jobId }
 */
export const POST = withErrorHandler(async (request) => {
  const user = await requireAuth();
  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "true";

  const [existing] = await sql`
    SELECT id FROM app.canvas_import_jobs
    WHERE user_id = ${user.user_id}
      AND type = 'vault-export'
      AND status IN ('queued', 'processing')
    LIMIT 1
  `;

  if (existing && !force) {
    return NextResponse.json(
      { error: "Export already in progress", activeJobId: existing.id },
      { status: 409 },
    );
  }

  // note: TOCTOU between SELECT and INSERT — concurrent double-submits could both create jobs.
  // acceptable for now (requires fast double-click); proper fix needs a unique partial index on (user_id, type) where status in ('queued','processing').
  const jobId = await sql.begin(async (tx: any) => {
    if (existing) {
      // also set cancel_requested_at so any running worker stops cooperatively
      await tx`
        UPDATE app.canvas_import_jobs
        SET status = 'cancelled', completed_at = NOW(), cancel_requested_at = NOW(), updated_at = NOW()
        WHERE user_id = ${user.user_id}
          AND type = 'vault-export'
          AND status IN ('queued', 'processing')
      `;
    }
    const [row] = await tx`
      INSERT INTO app.canvas_import_jobs (user_id, type, status)
      VALUES (${user.user_id}::uuid, 'vault-export', 'queued')
      RETURNING id
    `;
    return row.id;
  });

  try {
    await enqueueCanvasJob("vault-export", {
      jobId,
      userId: user.user_id,
    }, { attempts: 1 });
  } catch (err) {
    // enqueue failed — clean up the orphan queued row so it doesn't block future requests
    await sql`
      UPDATE app.canvas_import_jobs
      SET status = 'failed', error_message = 'Failed to enqueue job', completed_at = NOW(), updated_at = NOW()
      WHERE id = ${jobId}::uuid
    `;
    throw err;
  }

  return NextResponse.json({ jobId });
});
