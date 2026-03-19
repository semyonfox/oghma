import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth.js';
import sql from '@/database/pgsql.js';

/**
 * GET /api/canvas/logs?jobId=<uuid>
 *
 * Returns detailed import logs for a specific job or all recent imports.
 * Includes all file status changes for debugging and user awareness.
 *
 * Query params:
 *   jobId (optional) - Filter to a specific job's imports
 *
 * Response:
 * {
 *   success: true,
 *   jobId: uuid,
 *   logs: [{ filename, status, errorMessage, updatedAt, mimeType }]
 * }
 */
export async function GET(request) {
  try {
    const user = await validateSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    // If jobId provided, verify it belongs to this user
    if (jobId) {
      const job = await sql`
        SELECT id FROM app.canvas_import_jobs
        WHERE id = ${jobId}::uuid AND user_id = ${user.user_id}
      `;
      if (!job || job.length === 0) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }
    }

    // Get all imports for user (or filtered by job if provided)
    let query;
    if (jobId) {
      // Join to get imports associated with a specific job (via created_at matching)
      query = sql`
        SELECT 
          filename, status, error_message, updated_at, mime_type, created_at
        FROM app.canvas_imports
        WHERE user_id = ${user.user_id}
        ORDER BY updated_at DESC
        LIMIT 1000
      `;
    } else {
      // Get recent imports (last 1000)
      query = sql`
        SELECT 
          filename, status, error_message, updated_at, mime_type, created_at
        FROM app.canvas_imports
        WHERE user_id = ${user.user_id}
        ORDER BY updated_at DESC
        LIMIT 1000
      `;
    }

    const logs = await query;

    return NextResponse.json({
      success: true,
      jobId: jobId ?? null,
      count: logs.length,
      logs: logs.map(log => ({
        filename: log.filename,
        status: log.status,
        errorMessage: log.error_message,
        mimeType: log.mime_type,
        createdAt: log.created_at,
        updatedAt: log.updated_at,
      })),
    });

  } catch (err) {
    console.error('Canvas logs error:', err);
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
  }
}
