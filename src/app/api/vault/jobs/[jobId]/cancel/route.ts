import { NextResponse } from "next/server";
import {
  withErrorHandler,
  requireAuth,
  ApiError,
  type RouteParamsContext,
} from "@/lib/api-error";
import sql from "@/database/pgsql";
import { isUuid } from "@/lib/vault/jobs";

/**
 * DELETE /api/vault/jobs/:jobId/cancel
 *
 * A queued job has no worker yet, so it is cancelled now (the worker's claim
 * only takes queued rows). A processing job stops at its next heartbeat.
 */
export const DELETE = withErrorHandler(
  async (_request, { params }: RouteParamsContext<{ jobId: string }>) => {
    const user = await requireAuth();
    const { jobId } = await params;
    if (!isUuid(jobId)) {
      throw new ApiError(404, "Job not found or not cancellable");
    }

    const [updated] = await sql<{ id: string; status: string }[]>`
      UPDATE app.canvas_import_jobs
      SET cancel_requested_at = NOW(),
          status = CASE WHEN status = 'queued' THEN 'cancelled' ELSE status END,
          completed_at = CASE WHEN status = 'queued' THEN NOW() ELSE completed_at END,
          updated_at = CASE WHEN status = 'queued' THEN NOW() ELSE updated_at END
      WHERE id = ${jobId}::uuid
        AND user_id = ${user.user_id}::uuid
        AND type IN ('vault-import', 'vault-export')
        AND status IN ('queued', 'processing')
        AND cancel_requested_at IS NULL
      RETURNING id, status
    `;

    if (!updated) {
      throw new ApiError(404, "Job not found or not cancellable");
    }

    return NextResponse.json({ ok: true, jobId: updated.id, status: updated.status });
  },
);
