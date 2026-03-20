import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth.js';
import sql from '@/database/pgsql.js';

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

    // Active or most-recently-completed job
    const activeJobs = await sql`
      SELECT id, status, created_at, started_at, completed_at
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
      startedAt: job.started_at,
      createdAt: job.created_at,
    } : null;

    // File stats — scoped to files created since the job started (or all if no job)
    const since = job?.created_at ?? null;

    const [fileStats] = await sql`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'complete'    THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'downloading' THEN 1 END) as downloading,
        COUNT(CASE WHEN status = 'processing'  THEN 1 END) as processing,
        COUNT(CASE WHEN status = 'forbidden'   THEN 1 END) as forbidden,
        COUNT(CASE WHEN status = 'error'       THEN 1 END) as error
      FROM app.canvas_imports
      WHERE user_id = ${user.user_id}
        AND (${since}::timestamptz IS NULL OR created_at >= ${since})
    `;

    const recentLogs = await sql`
      SELECT filename, status, error_message, updated_at, canvas_course_id
      FROM app.canvas_imports
      WHERE user_id = ${user.user_id}
        AND (${since}::timestamptz IS NULL OR created_at >= ${since})
      ORDER BY updated_at DESC
      LIMIT 50
    `;

    const stats = fileStats ?? { total: 0, completed: 0, downloading: 0, processing: 0, forbidden: 0, error: 0 };
    const [total, completed, downloading, processing, forbidden, errorCount] =
      ['total', 'completed', 'downloading', 'processing', 'forbidden', 'error']
        .map(k => parseInt(stats[k], 10));

    // percent is only meaningful once the job is done — while active, total keeps growing
    // as the worker discovers new files, so completed/total is misleading
    const settled = completed + forbidden + errorCount;
    // null = no files discovered yet (job just started), 100 = done
    const progressPercent = !isActive && total > 0
      ? 100
      : total > 0
        ? Math.min(99, Math.round((settled / total) * 100))
        : null;

    return NextResponse.json({
      success: true,
      activeJob,
      progress: {
        total,
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
      })),
    });

  } catch (err) {
    console.error('Canvas status error:', err);
    return NextResponse.json({ error: 'Failed to fetch import status' }, { status: 500 });
  }
}
