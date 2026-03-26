import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth.js';
import sql from '@/database/pgsql.js';
import logger from '@/lib/logger';

function formatLog(row) {
  return {
    filename: row.filename,
    status: row.status,
    errorMessage: row.error_message,
    mimeType: row.mime_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function fetchLogs(userId, jobStart) {
  if (jobStart) {
    return sql`
      SELECT filename, status, error_message, updated_at, mime_type, created_at
      FROM app.canvas_imports
      WHERE user_id = ${userId} AND created_at >= ${jobStart}
      ORDER BY updated_at DESC LIMIT 1000`;
  }
  return sql`
    SELECT filename, status, error_message, updated_at, mime_type, created_at
    FROM app.canvas_imports
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC LIMIT 1000`;
}

export async function GET(request) {
  try {
    const user = await validateSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    // if jobId provided, verify ownership and get its start time in one query
    let jobStart = null;
    if (jobId) {
      const rows = await sql`
        SELECT created_at FROM app.canvas_import_jobs
        WHERE id = ${jobId}::uuid AND user_id = ${user.user_id}
      `;
      if (!rows.length) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }
      jobStart = rows[0].created_at;
    }

    const logs = await fetchLogs(user.user_id, jobStart);

    return NextResponse.json({
      success: true,
      jobId: jobId ?? null,
      count: logs.length,
      logs: logs.map(formatLog),
    });
  } catch (err) {
    logger.error('canvas logs error', { error: err });
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
  }
}
