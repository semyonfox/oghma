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

  // Validate the token is still live before queuing
  const client = new CanvasClient(credentials.domain, credentials.token);
  const { data: courses, error: coursesError } = await client.getCourses();
  if (!courses && coursesError) {
    throw new ApiError(401, "Canvas token is invalid or expired");
  }

  // Cancel any existing queued/processing job and insert the new one atomically
  // This prevents a worker from taking the old job after its replacement.
  const job = await sql.begin(async (sql) => {
    await sql`
      UPDATE app.canvas_import_jobs
      SET status = 'cancelled', completed_at = NOW()
      WHERE user_id = ${user.user_id} AND status IN ('queued', 'discovering', 'processing')
    `;
    const [inserted] = await sql`
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

  const cancelled = await sql`
    UPDATE app.canvas_import_jobs
    SET status = 'cancelled', completed_at = NOW()
    WHERE user_id = ${user.user_id} AND status IN ('queued', 'discovering', 'processing')
    RETURNING id
  `;

  if (cancelled.length === 0) {
    return NextResponse.json({
      success: true,
      cancelled: false,
      reason: "No active job",
    });
  }

  // mark in-flight file records so the worker skips them
  const jobId = cancelled[0].id;
  await sql`
    UPDATE app.canvas_imports
    SET status = 'cancelled', error_message = 'Cancelled by user', updated_at = NOW()
    WHERE job_id = ${jobId}::uuid AND status IN ('pending', 'downloading', 'processing', 'indexing')
  `;

  return NextResponse.json({ success: true, cancelled: true, jobId });
});
