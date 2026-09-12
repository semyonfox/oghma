import { NextResponse } from "next/server";
import { withErrorHandler, requireAuth, ApiError } from "@/lib/api-error";
import { CanvasClient } from "@/lib/canvas/client";
import sql from "@/database/pgsql";
import { enqueueCanvasJob } from "@/lib/queue";
import logger from "@/lib/logger";
import { loadCanvasCredentials } from "@/lib/canvas/credentials";
import {
  buildCanvasSyncCourses,
  discoverCanvasCourses,
  isCanvasCourseAvailabilityUnresolved,
} from "@/lib/canvas/sync-courses";
import { cancelActiveCanvasImportJobs } from "@/lib/canvas/cancel-import-jobs";

const ACTIVE_CANVAS_JOB_STATUSES = new Set([
  "queued",
  "discovering",
  "processing",
]);

interface AutomaticSyncBlocker {
  id: string;
  status: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function automaticSyncBlocked(blocker: AutomaticSyncBlocker) {
  const active = ACTIVE_CANVAS_JOB_STATUSES.has(blocker.status);
  return NextResponse.json({
    queued: false,
    reason: active
      ? "A Canvas import is already running"
      : "Canvas was synced recently",
    activeJobId: active ? blocker.id : undefined,
  });
}

/**
 * POST /api/canvas/sync
 *
 * Queues a resync job for all courses the user has previously imported from.
 * The import worker handles deduplication — only new files (canvas_file_id not
 * yet in canvas_imports with status='complete') will be downloaded.
 * `?automatic=true` applies a six-hour server-side cooldown and never replaces
 * active work. Manual requests retain the explicit replacement behavior.
 *
 * Returns { queued: true, jobId } or { queued: false, reason } if there is
 * nothing to sync (no prior imports or no canvas credentials).
 */
export const POST = withErrorHandler(async (request) => {
  const user = await requireAuth();
  const automatic = request.nextUrl.searchParams.get("automatic") === "true";

  const credentials = await loadCanvasCredentials(user.user_id);
  if (!credentials) {
    return NextResponse.json({
      queued: false,
      reason: "No Canvas account connected",
    });
  }

  // Derive the set of course IDs previously imported by this user
  const prevCourseRows = await sql<{ canvas_course_id: string | number }[]>`
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

  if (automatic) {
    const blockers = await sql<AutomaticSyncBlocker[]>`
      SELECT id, status
      FROM app.canvas_import_jobs
      WHERE user_id = ${user.user_id}::uuid
        AND type = 'canvas'
        AND (
          status IN ('queued', 'discovering', 'processing')
          OR COALESCE(completed_at, created_at) >= NOW() - INTERVAL '6 hours'
        )
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (blockers[0]) return automaticSyncBlocked(blockers[0]);
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

  // Manual syncs intentionally replace the active job. Automatic syncs use
  // the same per-user lock, then decline if another request won the race or a
  // Canvas job completed recently.
  const result = await sql.begin(async (tx) => {
    if (automatic) {
      await tx`
        SELECT pg_advisory_xact_lock(
          hashtext(${`oghma-canvas-import:${user.user_id}`})
        )
      `;
      const blockers = await tx<AutomaticSyncBlocker[]>`
        SELECT id, status
        FROM app.canvas_import_jobs
        WHERE user_id = ${user.user_id}::uuid
          AND type = 'canvas'
          AND (
            status IN ('queued', 'discovering', 'processing')
            OR COALESCE(completed_at, created_at) >= NOW() - INTERVAL '6 hours'
          )
        ORDER BY created_at DESC
        LIMIT 1
      `;
      if (blockers[0]) return { blocker: blockers[0], job: null };
    } else {
      await cancelActiveCanvasImportJobs(
        tx,
        user.user_id,
        "Replaced by a newer Canvas sync",
      );
    }
    const [inserted] = await tx<{ id: string }[]>`
      INSERT INTO app.canvas_import_jobs (user_id, course_ids, status, job_type)
      VALUES (${user.user_id}::uuid, ${JSON.stringify(courses)}::jsonb, 'queued', 'sync')
      RETURNING id
    `;
    return { blocker: null, job: inserted };
  });

  if (result.blocker) return automaticSyncBlocked(result.blocker);
  if (!result.job) throw new ApiError(500, "Failed to create Canvas sync job");

  const jobId = result.job.id;

  try {
    await enqueueCanvasJob("canvas-discover", { jobId, userId: user.user_id });
  } catch (queueErr) {
    logger.warn("queue enqueue failed for sync (job still queued in DB)", {
      error: errorMessage(queueErr),
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
    sql<{ count: number }[]>`SELECT COUNT(DISTINCT canvas_course_id)::int AS count FROM app.canvas_imports WHERE user_id = ${user.user_id}`,
    sql<{ id: string; status: string; created_at: Date | string }[]>`
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
