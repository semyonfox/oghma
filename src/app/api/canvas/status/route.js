import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth.js';
import sql from '@/database/pgsql.js';

/**
 * GET /api/canvas/status
 *
 * Returns the current state of all Canvas imports for the logged-in user.
 * Includes job-level summary and file-level details.
 *
 * Response shape:
 * {
 *   success: true,
 *   activeJob: { jobId, status, progress: { total, completed, failed }, estimatedTime },
 *   fileStats: { total, completed, downloading, processing, forbidden, error },
 *   recentErrors: [{ filename, error_message, status, updatedAt }]
 * }
 */
export async function GET() {
  try {
    const user = await validateSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get active/recent import job
    const activeJobs = await sql`
      SELECT id, status, created_at, started_at, completed_at
      FROM app.canvas_import_jobs
      WHERE user_id = ${user.user_id} AND status IN ('queued', 'processing')
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const activeJob = activeJobs?.[0] ?? null;

    // File-level stats for the active job (or all if none active)
    const fileStats = await sql`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'complete' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'downloading' THEN 1 END) as downloading,
        COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing,
        COUNT(CASE WHEN status = 'forbidden' THEN 1 END) as forbidden,
        COUNT(CASE WHEN status = 'error' THEN 1 END) as error
      FROM app.canvas_imports
      WHERE user_id = ${user.user_id}
    `;

    const stats = fileStats[0] || { total: 0, completed: 0, downloading: 0, processing: 0, forbidden: 0, error: 0 };
    
    // Calculate progress percentage
    const progressPercent = stats.total > 0 
      ? Math.round((stats.completed / stats.total) * 100) 
      : 0;

    // Estimate time remaining (rough: ~5 sec per file, or use actual timing if available)
    let estimatedSecsRemaining = null;
    if (activeJob && (stats.downloading > 0 || stats.processing > 0)) {
      const remaining = stats.downloading + stats.processing;
      estimatedSecsRemaining = Math.max(5, remaining * 5); // 5 seconds per file
    }

    // Recent errors for user awareness
    const recentErrors = await sql`
      SELECT filename, error_message, status, updated_at
      FROM app.canvas_imports
      WHERE user_id = ${user.user_id} AND status IN ('forbidden', 'error')
      ORDER BY updated_at DESC
      LIMIT 10
    `;

    return NextResponse.json({
      success: true,
      activeJob: activeJob ? {
        jobId: activeJob.id,
        status: activeJob.status,
        startedAt: activeJob.started_at,
        createdAt: activeJob.created_at,
      } : null,
      progress: {
        total: parseInt(stats.total, 10),
        completed: parseInt(stats.completed, 10),
        downloading: parseInt(stats.downloading, 10),
        processing: parseInt(stats.processing, 10),
        percent: progressPercent,
      },
      issues: {
        forbidden: parseInt(stats.forbidden, 10),
        error: parseInt(stats.error, 10),
      },
      estimatedSecsRemaining,
      recentErrors: recentErrors.map(r => ({
        filename: r.filename,
        errorMessage: r.error_message,
        status: r.status,
        updatedAt: r.updated_at,
      })),
    });

  } catch (err) {
    console.error('Canvas status error:', err);
    return NextResponse.json({ error: 'Failed to fetch import status' }, { status: 500 });
  }
}
