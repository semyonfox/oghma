import { NextResponse } from "next/server";
import {
  withErrorHandler,
  requireAuth,
  ApiError,
  parseJsonObject,
} from "@/lib/api-error";
import { CanvasTrashConflictError } from "@/lib/canvas/trash-conflicts";
import { CanvasClient } from "@/lib/canvas/client";
import sql from "@/database/pgsql";
import { enqueueCanvasJob } from "@/lib/queue";
import logger from "@/lib/logger";
import { loadCanvasCredentials } from "@/lib/canvas/credentials";
import { recordActivationMilestone } from "@/lib/marketing/events";
import { activeCanvasRun, canonicalCanvasCourses, lockCanvasRuns, startCanvasRun } from "@/lib/canvas/import-runs";
import { isValidUUID } from "@/lib/utils/uuid";
import { cancelActiveCanvasImportJobs } from "@/lib/canvas/cancel-import-jobs";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * POST /api/canvas/import
 *
 * Queues a background import job for the selected courses.
 * The import-worker process picks this up and runs the full pipeline.
 *
 * Body: { courseIds: Array<{ id, name, course_code }> | string[] }
 *
 * Returns: { success: true, queued: true, jobId: uuid }
 */
export const POST = withErrorHandler(async (request) => {
  const user = await requireAuth();

  const { courseIds, expectedActiveJobId, keepTrashedFolders } = await parseJsonObject(request);
  if (expectedActiveJobId !== undefined && !isValidUUID(expectedActiveJobId)) {
    throw new ApiError(400, "Invalid expected active import ID");
  }

  if (!Array.isArray(courseIds) || courseIds.length === 0) {
    throw new ApiError(400, "courseIds array is required");
  }
  let normalizedCourseIds;
  try {
    normalizedCourseIds = canonicalCanvasCourses(courseIds);
  } catch (error) {
    throw new ApiError(
      400,
      error instanceof Error ? error.message : "Invalid Canvas course ID",
    );
  }

  if (keepTrashedFolders !== undefined && typeof keepTrashedFolders !== "boolean") {
    throw new ApiError(400, "Invalid Trash choice");
  }
  const credentials = await loadCanvasCredentials(user.user_id);
  if (!credentials) {
    throw new ApiError(400, "No Canvas account connected");
  }

  // Validate against the enrollment ledger rather than the active-course
  // dashboard list. A valid token may have only older or pending courses.
  const client = new CanvasClient(credentials.domain, credentials.token);
  const enrollmentValidation = await client.getSelfEnrollments();
  if (enrollmentValidation.unauthorized) {
    throw new ApiError(401, "Canvas token is invalid or expired");
  }
  if (enrollmentValidation.error || enrollmentValidation.forbidden) {
    // Some institutional developer keys scope the self-enrollments endpoint.
    // A regular course-list response still proves that the token is live.
    const courseListValidation = await client.getDiscoverableCourses();
    if (courseListValidation.unauthorized) {
      throw new ApiError(401, "Canvas token is invalid or expired");
    }
    if (courseListValidation.error || courseListValidation.forbidden) {
      throw new ApiError(
        502,
        `Canvas connection failed: ${
          courseListValidation.error ??
          enrollmentValidation.error ??
          "access was denied"
        }`,
      );
    }
    // Continue: the worker validates the selected course's real resources.
  }

  const result = await startCanvasRun({
    checkTrash: !keepTrashedFolders,
    userId: user.user_id,
    courses: normalizedCourseIds,
    mode: "import",
    expectedActiveJobId: typeof expectedActiveJobId === "string" ? expectedActiveJobId : undefined,
  }).catch((error: unknown) => {
    if (error instanceof CanvasTrashConflictError) return error;
    throw error;
  });
  if (result instanceof CanvasTrashConflictError) {
    return NextResponse.json({ code: "canvas_folders_in_trash", folders: result.folders }, { status: 409 });
  }
  if (result.kind === "conflict") {
    return NextResponse.json({ error: "The active import changed. Confirm the current import before replacing it.", activeJob: result.activeJob }, { status: 409 });
  }
  const jobId = result.jobId;
  if (result.kind === "existing") {
    return NextResponse.json({ success: true, queued: true, alreadyActive: true, jobId });
  }

  try {
    await enqueueCanvasJob("canvas-discover", { jobId, userId: user.user_id });
  } catch (queueErr) {
    // non-fatal: worker DB safety-net poll catches it
    logger.warn("queue enqueue failed (job still queued in DB)", {
      jobId,
      error: errorMessage(queueErr),
    });
  }

  await recordActivationMilestone("canvas_import_started", user.user_id, request).catch(
    (eventError) => logger.warn("failed to record Canvas import start milestone", { error: errorMessage(eventError) }),
  );

  return NextResponse.json({ success: true, queued: true, jobId });
});

/**
 * DELETE /api/canvas/import
 *
 * Cancels the active import job for the current user.
 * Marks the job and all its in-flight file records as cancelled.
 */
export const DELETE = withErrorHandler(async (request) => {
  const user = await requireAuth();

  const expectedJobId = request.nextUrl.searchParams.get("jobId");
  if (!isValidUUID(expectedJobId)) throw new ApiError(400, "An import ID is required to stop it");
  const outcome = await sql.begin(async (tx) => {
    await lockCanvasRuns(tx, user.user_id);
    const active = await activeCanvasRun(tx, user.user_id);
    if (active && active.id !== expectedJobId) return { conflict: true, cancelled: [] };
    return { conflict: false, cancelled: active
      ? await cancelActiveCanvasImportJobs(tx, user.user_id, "Stopped by user") : [] };
  });
  if (outcome.conflict) return NextResponse.json({ error: "The active import changed. Refresh before stopping it." }, { status: 409 });
  const cancelled = outcome.cancelled;

  if (cancelled.length === 0) {
    return NextResponse.json({
      success: true,
      cancelled: false,
      reason: "No active job",
    });
  }

  const jobId = cancelled[0].id;

  return NextResponse.json({ success: true, cancelled: true, jobId });
});
