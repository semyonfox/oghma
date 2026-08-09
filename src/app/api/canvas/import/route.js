import { NextResponse } from "next/server";
import {
  withErrorHandler,
  requireAuth,
  ApiError,
  parseJsonObject,
} from "@/lib/api-error";
import { CanvasClient } from "@/lib/canvas/client.js";
import sql from "@/database/pgsql.js";
import { enqueueCanvasJob } from "@/lib/queue";
import logger from "@/lib/logger";
import { loadCanvasCredentials } from "@/lib/canvas/credentials";
import { recordActivationMilestone } from "@/lib/marketing/events";
import { normalizeCanvasCourseSelection } from "@/lib/canvas/id.js";
import { cancelActiveCanvasImportJobs } from "@/lib/canvas/cancel-import-jobs";

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

  const { courseIds } = await parseJsonObject(request);

  if (!Array.isArray(courseIds) || courseIds.length === 0) {
    throw new ApiError(400, "courseIds array is required");
  }
  let normalizedCourseIds;
  try {
    normalizedCourseIds = courseIds.map(normalizeCanvasCourseSelection);
  } catch (error) {
    throw new ApiError(
      400,
      error instanceof Error ? error.message : "Invalid Canvas course ID",
    );
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

  // Cancel any existing queued/processing job and insert the new one atomically
  // This prevents a worker from taking the old job after its replacement.
  const job = await sql.begin(async (tx) => {
    await cancelActiveCanvasImportJobs(
      tx,
      user.user_id,
      "Replaced by a newer Canvas import",
    );
    const [inserted] = await tx`
      INSERT INTO app.canvas_import_jobs (user_id, course_ids, status)
      VALUES (${user.user_id}::uuid, ${JSON.stringify(normalizedCourseIds)}::jsonb, 'queued')
      RETURNING id
    `;
    return inserted;
  });

  const jobId = job.id;

  try {
    await enqueueCanvasJob("canvas-discover", { jobId, userId: user.user_id });
  } catch (queueErr) {
    // non-fatal: worker DB safety-net poll catches it
    logger.warn("queue enqueue failed (job still queued in DB)", {
      jobId,
      error: queueErr.message,
    });
  }

  await recordActivationMilestone("canvas_import_started", user.user_id, request).catch(
    (eventError) => logger.warn("failed to record Canvas import start milestone", { error: eventError.message }),
  );

  return NextResponse.json({ success: true, queued: true, jobId });
});

/**
 * DELETE /api/canvas/import
 *
 * Cancels the active import job for the current user.
 * Marks the job and all its in-flight file records as cancelled.
 */
export const DELETE = withErrorHandler(async () => {
  const user = await requireAuth();

  const cancelled = await sql.begin((tx) =>
    cancelActiveCanvasImportJobs(tx, user.user_id, "Cancelled by user"),
  );

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
