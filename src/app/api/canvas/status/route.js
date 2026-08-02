import { NextResponse } from "next/server";
import { withErrorHandler, requireAuth } from "@/lib/api-error";
import sql from "@/database/pgsql.js";

/**
 * GET /api/canvas/status
 *
 * Returns the current state of the active Canvas import job plus live file logs.
 *
 * Response shape:
 * {
 *   success: true,
 *   activeJob: { jobId, status, createdAt, startedAt } | null,
 *   progress: { total, completed, downloading, processing, pendingMarker, percent },
 *   issues: { forbidden, error },
 *   markerColdStarting: boolean,
 *   estimatedSecsRemaining: number | null,
 *   recentLogs: [{ filename, status, errorMessage, updatedAt }],
 * }
 */
export const GET = withErrorHandler(async () => {
  const user = await requireAuth();

  // active or most-recently-completed job
  const activeJobs = await sql`
    SELECT id, status, job_type, created_at, started_at, completed_at, expected_total
    FROM app.canvas_import_jobs
    WHERE user_id = ${user.user_id}
    ORDER BY created_at DESC
    LIMIT 1
  `;

  const job = activeJobs?.[0] ?? null;
  const isActive =
    job && ["queued", "discovering", "processing"].includes(job.status);
  const activeJob = isActive
    ? {
        jobId: job.id,
        status: job.status,
        // phase lets the UI differentiate "discovering files" from "importing files"
        phase:
          job.status === "discovering" || job.status === "queued"
            ? "discovering"
            : "processing",
        jobType: job.job_type,
        startedAt: job.started_at,
        createdAt: job.created_at,
      }
    : null;

  // scope file stats to the current job via job_id FK when available,
  // fall back to time-based scoping for legacy jobs without job_id
  const jobId = job?.id ?? null;
  const since = job?.created_at ?? null;

  const [fileStats, recentLogs] = await Promise.all([
    sql`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'complete'    THEN 1 END) as indexed,
        COUNT(CASE WHEN status = 'indexing'    THEN 1 END) as indexing,
        COUNT(CASE WHEN status = 'downloading' THEN 1 END) as downloading,
        COUNT(CASE WHEN status = 'processing'  THEN 1 END) as processing,
        COUNT(CASE WHEN status = 'pending_marker' THEN 1 END) as pending_marker,
        COUNT(CASE WHEN status = 'forbidden'   THEN 1 END) as forbidden,
        COUNT(CASE WHEN status = 'error'       THEN 1 END) as error
      FROM app.canvas_imports
      WHERE user_id = ${user.user_id}
        AND CASE
          WHEN ${jobId}::uuid IS NOT NULL THEN job_id = ${jobId}::uuid
          ELSE ${since}::timestamptz IS NULL OR created_at >= ${since}
        END
    `,
    sql`
      SELECT filename, status, error_message, updated_at, canvas_course_id, note_id
      FROM app.canvas_imports
      WHERE user_id = ${user.user_id}
        AND CASE
          WHEN ${jobId}::uuid IS NOT NULL THEN job_id = ${jobId}::uuid
          ELSE ${since}::timestamptz IS NULL OR created_at >= ${since}
        END
      ORDER BY updated_at DESC
      LIMIT 50
    `,
  ]);

  const stats = fileStats[0] ?? {
    total: 0,
    indexed: 0,
    indexing: 0,
    downloading: 0,
    processing: 0,
    pending_marker: 0,
    forbidden: 0,
    error: 0,
  };
  const [
    total,
    indexed,
    indexing,
    downloading,
    processing,
    pendingMarker,
    forbidden,
    errorCount,
  ] = [
    "total",
    "indexed",
    "indexing",
    "downloading",
    "processing",
    "pending_marker",
    "forbidden",
    "error",
  ].map((k) => parseInt(stats[k], 10));
  const completed = indexed + indexing;

  // use expected_total from the discovery phase as denominator when available —
  // this prevents the progress bar from jumping backwards as new files are found
  const denominator = job?.expected_total ?? total;
  const settled = completed + pendingMarker + forbidden + errorCount;
  const etaCompleted = indexed + forbidden + errorCount;
  const progressPercent =
    !isActive && denominator > 0
      ? 100
      : denominator > 0
        ? Math.min(99, Math.round((settled / denominator) * 100))
        : null;
  // An ETA is only meaningful once at least one file has settled. Use the
  // observed job rate rather than inventing a fixed processing duration.
  const elapsedSecs = job?.started_at
    ? Math.max(0, (Date.now() - new Date(job.started_at).getTime()) / 1000)
    : null;
  const estimatedSecsRemaining =
    isActive && job?.status === "processing" && etaCompleted > 0 && denominator > etaCompleted && elapsedSecs != null
      ? Math.max(1, Math.ceil((elapsedSecs / etaCompleted) * (denominator - etaCompleted)))
      : null;

  return NextResponse.json({
    success: true,
    activeJob,
    progress: {
      total: denominator,
      completed,
      indexed,
      indexing,
      downloading,
      processing,
      pendingMarker,
      percent: progressPercent,
    },
    issues: {
      forbidden,
      error: errorCount,
    },
    // `pending_marker` means the file was handed off to the asynchronous
    // Marker pipeline; it is not evidence that a cold start is happening.
    // The pipeline currently exposes no cold-start signal, so be explicit
    // rather than showing a misleading warm-up warning.
    markerColdStarting: false,
    estimatedSecsRemaining,
    recentLogs: (recentLogs ?? []).map((r) => ({
      filename: r.filename,
      status: r.status,
      errorMessage: r.error_message,
      updatedAt: r.updated_at,
      courseId:
        r.canvas_course_id == null ? null : String(r.canvas_course_id),
      noteId: r.note_id,
    })),
  });
});
