import { NextResponse } from "next/server";
import { withErrorHandler, requireAuth } from "@/lib/api-error";
import { CanvasClient } from "@/lib/canvas/client.js";
import sql from "@/database/pgsql.js";
import { sqsClient, getCanvasImportQueueUrl } from "@/lib/sqs";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { ensureWorkerRunning } from "@/lib/ecs";
import logger from "@/lib/logger";
import { loadCanvasCredentials } from "@/lib/canvas/credentials";

/**
 * POST /api/canvas/sync
 *
 * Queues a resync job for all courses the user has previously imported from.
 * The import worker handles deduplication — only new files (canvas_file_id not
 * yet in canvas_imports with status='complete') will be downloaded.
 *
 * Returns { queued: true, jobId } or { queued: false, reason } if there is
 * nothing to sync (no prior imports or no canvas credentials).
 */
export const POST = withErrorHandler(async () => {
  const user = await requireAuth();

  const credentials = await loadCanvasCredentials(user.user_id);
  if (!credentials) {
    return NextResponse.json({
      queued: false,
      reason: "No Canvas account connected",
    });
  }

  // Derive the set of course IDs previously imported by this user
  const prevCourseRows = await sql`
    SELECT DISTINCT canvas_course_id
    FROM app.canvas_imports
    WHERE user_id = ${user.user_id}
    LIMIT 200
  `;

  if (prevCourseRows.length === 0) {
    return NextResponse.json({
      queued: false,
      reason: "No previously imported courses",
    });
  }

  const prevCourseIds = new Set(
    prevCourseRows.map((r) => String(r.canvas_course_id)),
  );

  // Fetch current course list from Canvas to get up-to-date name / course_code
  const client = new CanvasClient(credentials.domain, credentials.token);
  const { data: allCourses } = await client.getCourses();

  const courses = (allCourses ?? [])
    .filter((c) => prevCourseIds.has(String(c.id)))
    .map((c) => ({
      id: c.id,
      name: c.name ?? String(c.id),
      course_code: c.course_code ?? "",
      term: c.term ?? null,
    }));

  // Fall back to bare ID objects for any course no longer visible in Canvas
  for (const id of prevCourseIds) {
    if (!courses.some((c) => String(c.id) === id)) {
      courses.push({ id: Number(id), name: String(id), course_code: "" });
    }
  }

  if (courses.length === 0) {
    return NextResponse.json({
      queued: false,
      reason: "No matching active courses found",
    });
  }

  // cancel any in-flight job and insert the sync atomically
  const job = await sql.begin(async (sql) => {
    await sql`
      UPDATE app.canvas_import_jobs
      SET status = 'cancelled', completed_at = NOW()
      WHERE user_id = ${user.user_id} AND status IN ('queued', 'discovering', 'processing')
    `;
    const [inserted] = await sql`
      INSERT INTO app.canvas_import_jobs (user_id, course_ids, status, job_type)
      VALUES (${user.user_id}::uuid, ${JSON.stringify(courses)}::jsonb, 'queued', 'sync')
      RETURNING id
    `;
    return inserted;
  });

  const jobId = job.id;

  try {
    await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: getCanvasImportQueueUrl(),
        MessageBody: JSON.stringify({ type: "canvas-discover", jobId, userId: user.user_id }),
      }),
    );
    await ensureWorkerRunning();
  } catch (sqsErr) {
    logger.warn("SQS send failed for sync (job still queued in DB)", {
      error: sqsErr.message,
    });
  }

  return NextResponse.json({ queued: true, jobId });
});

/**
 * GET /api/canvas/sync
 *
 * Returns whether a sync is available (user has canvas credentials + prior imports)
 * and whether a sync job is currently active.
 */
export const GET = withErrorHandler(async () => {
  const user = await requireAuth();

  const [credentials, prevCourseRows, activeJobRows] = await Promise.all([
    loadCanvasCredentials(user.user_id),
    sql`SELECT COUNT(DISTINCT canvas_course_id)::int AS count FROM app.canvas_imports WHERE user_id = ${user.user_id}`,
    sql`
      SELECT id, status, created_at FROM app.canvas_import_jobs
      WHERE user_id = ${user.user_id} AND status IN ('queued', 'discovering', 'processing')
      ORDER BY created_at DESC LIMIT 1
    `,
  ]);
  const courseCount = prevCourseRows[0]?.count ?? 0;

  return NextResponse.json({
    available: !!(credentials && courseCount > 0),
    courseCount,
    activeJob: activeJobRows[0] ?? null,
  });
});
