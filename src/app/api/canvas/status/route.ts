import { NextResponse } from "next/server";
import { withErrorHandler, requireAuth } from "@/lib/api-error";
import sql from "@/database/pgsql";
import { isValidUUID } from "@/lib/utils/uuid";

interface CanvasJobRow {
  id: string;
  status: string;
  job_type: string;
  created_at: Date | string;
  started_at: Date | string | null;
  completed_at: Date | string | null;
  expected_total: number | null;
  error_message: string | null;
}

interface CanvasFileStatsRow {
  total: string;
  indexed: string;
  indexing: string;
  downloading: string;
  processing: string;
  pending_retry: string;
  pending_marker: string;
  forbidden: string;
  error: string;
}

interface CanvasLogRow {
  filename: string;
  status: string;
  error_message: string | null;
  updated_at: Date | string;
  canvas_course_id: string | number | null;
  note_id: string | null;
}

interface TreePathRow {
  leaf_note_id: string;
  tree_path: string[] | null;
}

interface PublishedNoteRow {
  note_id: string;
}

/**
 * GET /api/canvas/status
 *
 * Returns the current state of the active Canvas import job plus live file logs.
 *
 * Response shape:
 * {
 *   success: true,
 *   latestJob: { jobId, status, createdAt, startedAt, completedAt } | null,
 *   activeJob: { jobId, status, createdAt, startedAt } | null,
 *   progress: { total, completed, downloading, processing, retrying, pendingMarker, percent },
 *   issues: { forbidden, error },
 *   markerColdStarting: boolean,
 *   estimatedSecsRemaining: number | null,
 *   publishedJobId: string | null,
 *   publishedTreePaths: string[][],
 *   recentLogs: [{ filename, status, errorMessage, updatedAt, noteId, treePath }],
 * }
 */
export const GET = withErrorHandler(async (request) => {
  const user = await requireAuth();
  const publishJobId = request.nextUrl.searchParams.get("publishJobId");
  if (publishJobId !== null && !isValidUUID(publishJobId)) {
    return NextResponse.json(
      { error: "Invalid Canvas import job ID" },
      { status: 400 },
    );
  }

  // active or most-recently-completed job
  const activeJobs = await sql<CanvasJobRow[]>`
    SELECT id, status, job_type, created_at, started_at, completed_at, expected_total, error_message
    FROM app.canvas_import_jobs
    WHERE user_id = ${user.user_id} AND type = 'canvas'
    ORDER BY created_at DESC
    LIMIT 1
  `;

  const job = activeJobs?.[0] ?? null;
  const isActive =
    job && ["queued", "discovering", "processing"].includes(job.status);
  const latestJob = job
    ? {
        jobId: job.id,
        status: job.status,
        jobType: job.job_type,
        createdAt: job.created_at,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        errorMessage: job.error_message ?? null,
      }
    : null;
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
    sql<CanvasFileStatsRow[]>`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'complete'    THEN 1 END) as indexed,
        COUNT(CASE WHEN status = 'indexing'    THEN 1 END) as indexing,
        COUNT(CASE WHEN status = 'downloading' THEN 1 END) as downloading,
        COUNT(CASE WHEN status = 'processing'  THEN 1 END) as processing,
        COUNT(CASE WHEN status = 'pending_retry' THEN 1 END) as pending_retry,
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
    sql<CanvasLogRow[]>`
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
    pending_retry: 0,
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
    retrying,
    pendingMarker,
    forbidden,
    errorCount,
  ] = [
    stats.total,
    stats.indexed,
    stats.indexing,
    stats.downloading,
    stats.processing,
    stats.pending_retry,
    stats.pending_marker,
    stats.forbidden,
    stats.error,
  ].map((value) => parseInt(String(value), 10));
  const completed = indexed + indexing;

  // use expected_total from the discovery phase as denominator when available —
  // this prevents the progress bar from jumping backwards as new files are found
  const denominator = job?.expected_total ?? total;
  // GPU handoff is visible as pendingMarker but is not settled: the document
  // has not reached the note/chunk/vector stores until completion succeeds.
  const settled = completed + forbidden + errorCount;
  const etaCompleted = indexed + forbidden + errorCount;
  // Only an explicitly completed parent owns 100%. A failed/cancelled parent
  // may have terminal file rows too, but reporting it as complete hides the
  // operational distinction the user needs to resolve it.
  const progressPercent =
    denominator > 0
      ? job?.status === "complete"
        ? 100
        : Math.min(99, Math.round((settled / denominator) * 100))
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

  // Keep the visible log bounded, but publish every affected tree branch once
  // a job settles. Otherwise imports larger than the log limit can leave an
  // already-loaded folder stale until the next full page load.
  let publicationJob: Pick<CanvasJobRow, "id" | "status"> | null =
    publishJobId === job?.id ? job : null;
  if (publishJobId && !publicationJob) {
    const publicationJobs = await sql<
      Pick<CanvasJobRow, "id" | "status">[]
    >`
      SELECT id, status
      FROM app.canvas_import_jobs
      WHERE id = ${publishJobId}::uuid
        AND user_id = ${user.user_id}::uuid
        AND type = 'canvas'
      LIMIT 1
    `;
    publicationJob = publicationJobs[0] ?? null;
  }
  const publishedJobId =
    publicationJob &&
    ["complete", "failed", "cancelled"].includes(publicationJob.status)
      ? publicationJob.id
      : null;
  const publishedNotes =
    publishedJobId
      ? await sql<PublishedNoteRow[]>`
          SELECT DISTINCT note_id
          FROM app.canvas_imports
          WHERE user_id = ${user.user_id}
            AND note_id IS NOT NULL
            AND job_id = ${publishedJobId}::uuid
        `
      : [];

  // Notes become durable before OCR/embedding completes. Include each visible
  // note's path so the client can refresh only that branch rather than reset
  // its lazy-loaded tree. The traversal is bounded defensively against cycles.
  const noteIds = [
    ...new Set(
      [...(recentLogs ?? []), ...publishedNotes]
        .map((row) => row.note_id)
        .filter(
          (noteId): noteId is string => typeof noteId === "string",
        ),
    ),
  ];
  const treePaths =
    noteIds.length > 0
      ? await sql<TreePathRow[]>`
          WITH RECURSIVE note_paths AS (
            SELECT
              tree_item.note_id AS leaf_note_id,
              tree_item.note_id,
              tree_item.parent_id,
              0 AS depth,
              ARRAY[tree_item.note_id]::uuid[] AS visited
            FROM app.tree_items AS tree_item
            WHERE tree_item.user_id = ${user.user_id}::uuid
              AND tree_item.note_id = ANY(${noteIds}::uuid[])

            UNION ALL

            SELECT
              note_paths.leaf_note_id,
              parent.note_id,
              parent.parent_id,
              note_paths.depth + 1,
              array_append(note_paths.visited, parent.note_id)
            FROM note_paths
            JOIN app.tree_items AS parent
              ON parent.user_id = ${user.user_id}::uuid
             AND parent.note_id = note_paths.parent_id
            WHERE note_paths.depth < 32
              AND NOT parent.note_id = ANY(note_paths.visited)
          )
          SELECT
            leaf_note_id,
            ARRAY_AGG(note_id ORDER BY depth DESC) AS tree_path
          FROM note_paths
          GROUP BY leaf_note_id
        `
      : [];
  const treePathByNoteId = new Map(
    treePaths.map((row) => [
      row.leaf_note_id,
      Array.isArray(row.tree_path) ? row.tree_path : [],
    ]),
  );

  return NextResponse.json({
    success: true,
    latestJob,
    activeJob,
    progress: {
      total: denominator,
      completed,
      indexed,
      indexing,
      downloading,
      processing,
      retrying,
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
    publishedJobId,
    publishedTreePaths: publishedNotes.flatMap((row) => {
      const path = treePathByNoteId.get(row.note_id);
      return path?.length ? [path] : [];
    }),
    recentLogs: (recentLogs ?? []).map((r) => ({
      filename: r.filename,
      status: r.status,
      errorMessage: r.error_message,
      updatedAt: r.updated_at,
      courseId:
        r.canvas_course_id == null ? null : String(r.canvas_course_id),
      noteId: r.note_id,
      treePath: r.note_id ? treePathByNoteId.get(r.note_id) ?? [] : [],
    })),
  });
});
