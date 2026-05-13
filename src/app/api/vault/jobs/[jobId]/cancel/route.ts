import { NextResponse } from "next/server";
import { withErrorHandler, requireAuth, ApiError } from "@/lib/api-error";
import sql from "@/database/pgsql.js";

export const DELETE = withErrorHandler(
  async (_request, { params }: { params: { jobId: string } }) => {
    const user = await requireAuth();
    const { jobId } = params;

    const [updated] = await sql`
      UPDATE app.canvas_import_jobs
      SET cancel_requested_at = NOW(), updated_at = NOW()
      WHERE id = ${jobId}::uuid
        AND user_id = ${user.user_id}
        AND status IN ('queued', 'processing')
        AND cancel_requested_at IS NULL
      RETURNING id
    `;

    if (!updated) {
      throw new ApiError(404, "Job not found or not cancellable");
    }

    return NextResponse.json({ ok: true, jobId: updated.id });
  },
);
