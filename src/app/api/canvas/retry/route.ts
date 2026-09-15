import { NextResponse } from "next/server";
import { ApiError, parseJsonObject, requireAuth, withErrorHandler } from "@/lib/api-error";
import sql from "@/database/pgsql";
import { isValidUUID } from "@/lib/utils/uuid";
import { canonicalCanvasCourses, CanvasRetryUnavailableError, startCanvasRun } from "@/lib/canvas/import-runs";
import { dispatchFairCanvasFiles } from "@/lib/canvas/import-scheduler";

export const POST = withErrorHandler(async (request) => {
  const user = await requireAuth();
  const { sourceJobId, expectedActiveJobId } = await parseJsonObject(request);
  if (!isValidUUID(sourceJobId) ||
      (expectedActiveJobId !== undefined && !isValidUUID(expectedActiveJobId))) {
    throw new ApiError(400, "Invalid import ID");
  }
  const [source] = await sql<{ course_ids: unknown }[]>`
    SELECT course_ids FROM app.canvas_import_jobs WHERE id = ${sourceJobId}::uuid
      AND user_id = ${user.user_id}::uuid AND type = 'canvas'
  `;
  if (!source) throw new ApiError(404, "Import not found");
  const courses: unknown = typeof source.course_ids === "string" ? JSON.parse(source.course_ids) : source.course_ids;
  try {
    const result = await startCanvasRun({ userId: user.user_id,
      courses: canonicalCanvasCourses(Array.isArray(courses) ? courses : []), mode: "retry", sourceJobId,
      expectedActiveJobId: typeof expectedActiveJobId === "string" ? expectedActiveJobId : undefined });
    if (result.kind === "conflict") return NextResponse.json({ error: "Confirm the current import before replacing it.", activeJob: result.activeJob }, { status: 409 });
    if (result.kind === "created") await dispatchFairCanvasFiles(1)
      .catch(() => console.warn("Canvas retry dispatch deferred to database poll"));
    return NextResponse.json({ queued: true, jobId: result.jobId, alreadyActive: result.kind === "existing" });
  } catch (error) {
    if (error instanceof CanvasRetryUnavailableError) throw new ApiError(409, error.message);
    throw error;
  }
});
