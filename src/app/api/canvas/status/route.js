import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth.js';
import sql from '@/database/pgsql.js';
import logger from '@/lib/logger';

/**
 * GET /api/canvas/status
 *
 * Returns the current state of the active Canvas import job plus live file logs.
 *
 * Response shape:
 * {
 *   success: true,
 *   activeJob: { jobId, status, createdAt, startedAt } | null,
 *   progress: { total, completed, downloading, processing, percent },
 *   issues: { forbidden, error },
 *   estimatedSecsRemaining: number | null,
 *   recentLogs: [{ filename, status, errorMessage, updatedAt }],
 * }
 */
export async function GET() {
  try {
    const user = await validateSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // active or most-recently-completed job
    const activeJobs = await sql`
      SELECT id, status, job_type, created_at, started_at, completed_at, expected_total
      FROM app.canvas_import_jobs
      WHERE user_id = ${user.user_id}
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const job = activeJobs?.[0] ?? null;
    const isActive = job && ['queued', 'processing'].includes(job.status);
    const activeJob = isActive ? {
      jobId: job.id,
      status: job.status,
      jobType: job.job_type,
      startedAt: job.started_at,
      createdAt: job.created_at,
    } : null;

    // scope file stats to the current job via job_id FK when available,
    // fall back to time-based scoping for legacy jobs without job_id
    const jobId = job?.id ?? null;
    const since = job?.created_at ?? null;

    const [fileStats, recentLogs] = await Promise.all([
      sql`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'complete'    THEN 1 END) as completed,
          COUNT(CASE WHEN status = 'downloading' THEN 1 END) as downloading,
          COUNT(CASE WHEN status = 'processing'  THEN 1 END) as processing,
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

    const stats = fileStats[0] ?? { total: 0, completed: 0, downloading: 0, processing: 0, forbidden: 0, error: 0 };
    const [total, completed, downloading, processing, forbidden, errorCount] =
      ['total', 'completed', 'downloading', 'processing', 'forbidden', 'error']
        .map(k => parseInt(stats[k], 10));

    // use expected_total from the discovery phase as denominator when available —
    // this prevents the progress bar from jumping backwards as new files are found
    const denominator = job?.expected_total ?? total;
    const settled = completed + forbidden + errorCount;
    const progressPercent = !isActive && denominator > 0
      ? 100
      : denominator > 0
        ? Math.min(99, Math.round((settled / denominator) * 100))
        : null;

    return NextResponse.json({
      success: true,
      activeJob,
      progress: {
        total: denominator,
        completed,
        downloading,
        processing,
        percent: progressPercent,
      },
      issues: {
        forbidden,
        error: errorCount,
      },
      recentLogs: (recentLogs ?? []).map(r => ({
        filename: r.filename,
        status: r.status,
        errorMessage: r.error_message,
        updatedAt: r.updated_at,
        courseId: r.canvas_course_id,
        noteId: r.note_id,
      })),
    });

  } catch (err) {
    logger.error('canvas status error', { error: err });
    return NextResponse.json({ error: 'Failed to fetch import status' }, { status: 500 });
  }
}
