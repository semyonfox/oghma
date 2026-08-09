import { NextResponse } from "next/server";
import { withErrorHandler, requireAuth, ApiError } from "@/lib/api-error";
import { CanvasClient } from "@/lib/canvas/client.js";
import sql from "@/database/pgsql.js";
import { enqueueCanvasJob } from "@/lib/queue";
import logger from "@/lib/logger";
import { loadCanvasCredentials } from "@/lib/canvas/credentials";
import {
  buildCanvasSyncCourses,
  discoverCanvasCourses,
  isCanvasCourseAvailabilityUnresolved,
} from "@/lib/canvas/sync-courses.js";
import { cancelActiveCanvasImportJobs } from "@/lib/canvas/cancel-import-jobs";

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
      AND canvas_course_id IS NOT NULL
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

  // Use the enrollment ledger, not Canvas's dashboard-oriented course list,
  // so a resync retains older and otherwise hidden accessible courses.
  const client = new CanvasClient(credentials.domain, credentials.token);

  let courses;
  let unresolvedCourses;
  try {
    const discovery = await discoverCanvasCourses(
      client,
      prevCourseIds,
    );
    if (discovery.error) {
      throw new ApiError(502, `Canvas course discovery failed: ${discovery.error}`);
    }
    unresolvedCourses = discovery.data.filter(
      (course) =>
        prevCourseIds.has(String(course.id)) &&
        isCanvasCourseAvailabilityUnresolved(course),
    );
    courses = buildCanvasSyncCourses(prevCourseIds, discovery.data);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, "Canvas returned invalid course metadata");
  }

  if (unresolvedCourses.length > 0) {
    return NextResponse.json({
      queued: false,
      reason:
        "Canvas could not confirm access to all previously imported courses. Try again later.",
    });
  }

  if (courses.length === 0) {
    return NextResponse.json({
      queued: false,
      reason: "No previously imported Canvas courses are accessible",
    });
  }

  // cancel any in-flight job and insert the sync atomically
  const job = await sql.begin(async (tx) => {
    await cancelActiveCanvasImportJobs(
      tx,
      user.user_id,
      "Replaced by a newer Canvas sync",
    );
    const [inserted] = await tx`
      INSERT INTO app.canvas_import_jobs (user_id, course_ids, status, job_type)
      VALUES (${user.user_id}::uuid, ${JSON.stringify(courses)}::jsonb, 'queued', 'sync')
      RETURNING id
    `;
    return inserted;
  });

  const jobId = job.id;

  try {
    await enqueueCanvasJob("canvas-discover", { jobId, userId: user.user_id });
  } catch (queueErr) {
    logger.warn("queue enqueue failed for sync (job still queued in DB)", {
      error: queueErr.message,
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
      WHERE user_id = ${user.user_id}
        AND type = 'canvas'
        AND status IN ('queued', 'discovering', 'processing')
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
