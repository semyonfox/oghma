import { NextResponse } from "next/server";
import { withErrorHandler, requireAuth, ApiError } from "@/lib/api-error";
import { CanvasClient } from "@/lib/canvas/client.js";
import sql from "@/database/pgsql.js";
import { sqsClient, getCanvasImportQueueUrl } from "@/lib/sqs";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { ensureWorkerRunning } from "@/lib/ecs";
import { decrypt } from "@/lib/crypto";
import logger from "@/lib/logger";

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

  const { courseIds } = await request.json();

  if (!Array.isArray(courseIds) || courseIds.length === 0) {
    throw new ApiError(400, "courseIds array is required");
  }

  const rows = await sql`
    SELECT canvas_token, canvas_domain
    FROM app.login
    WHERE user_id = ${user.user_id}
  `;

  const { canvas_token, canvas_domain } = rows[0] ?? {};

  if (!canvas_token || !canvas_domain) {
    throw new ApiError(400, "No Canvas account connected");
  }

  // decrypt the stored token before using it
  const plainToken = decrypt(canvas_token, user.user_id);

  // Validate the token is still live before queuing
  const client = new CanvasClient(canvas_domain, plainToken);
  const { data: courses, error: coursesError } = await client.getCourses();
  if (!courses && coursesError) {
    throw new ApiError(401, "Canvas token is invalid or expired");
  }

  // Cancel any existing queued/processing job and insert the new one atomically
  // so no worker can pick up the old job after we've already replaced it
  const job = await sql.begin(async (sql) => {
    await sql`
      UPDATE app.canvas_import_jobs
      SET status = 'cancelled', completed_at = NOW()
      WHERE user_id = ${user.user_id} AND status IN ('queued', 'processing')
    `;
    const [inserted] = await sql`
      INSERT INTO app.canvas_import_jobs (user_id, course_ids, status)
      VALUES (${user.user_id}::uuid, ${JSON.stringify(courseIds)}::jsonb, 'queued')
      RETURNING id
    `;
    return inserted;
  });

  const jobId = job.id;

  let sqsOk = false;
  let ecsOk = false;
  const queueUrl = getCanvasImportQueueUrl();

  try {
    if (!queueUrl) {
      logger.error(
        "SQS_QUEUE_URL is empty — import job will rely on DB safety-net only",
        { jobId },
      );
    } else {
      await sqsClient.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify({ type: "canvas-discover", jobId, userId: user.user_id }),
        }),
      );
      sqsOk = true;
    }
  } catch (sqsErr) {
    logger.warn("SQS send failed", {
      jobId,
      error: sqsErr.message,
      queueUrl: queueUrl ? "(set)" : "(empty)",
    });
  }

  try {
    await ensureWorkerRunning();
    ecsOk = true;
  } catch (ecsErr) {
    logger.warn("ECS scale-up failed", { jobId, error: ecsErr.message });
  }

  if (!sqsOk && !ecsOk) {
    logger.error(
      "Both SQS and ECS failed — import job may not be processed",
      { jobId },
    );
  }

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
    WHERE user_id = ${user.user_id} AND status IN ('queued', 'processing')
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
    WHERE job_id = ${jobId}::uuid AND status IN ('downloading', 'processing', 'indexing')
  `;

  return NextResponse.json({ success: true, cancelled: true, jobId });
});
