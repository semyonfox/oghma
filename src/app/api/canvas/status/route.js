import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth.js';
import sql from '@/database/pgsql.js';

/**
 * GET /api/canvas/status
 *
 * Returns the current state of all Canvas imports for the logged-in user.
 * The frontend polls this endpoint to drive the progress UI and to show which files were forbidden and need to be uploaded manually.
 *
 * Response shape:
 * {
 *   summary: { pending, downloading, processing, complete, forbidden, error },
 *   forbidden: [{ filename, canvas_course_id, canvas_module_id, error_message }],
 *   recent:    [{ filename, status, updated_at, error_message }]
 * }
 */
export async function GET() {
  try {
    const user = await validateSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Count of imports in each status — used to drive the progress bar
    const summaryCounts = await sql`
      SELECT status, COUNT(*) as count
      FROM app.canvas_imports
      WHERE user_id = ${user.user_id}
      GROUP BY status
    `;

    // Build a flat summary object with zeroed defaults for every possible status
    const summary = {
      pending: 0,
      downloading: 0,
      processing: 0,
      complete: 0,
      forbidden: 0,
      error: 0,
    };

    for (const row of summaryCounts) {
      summary[row.status] = parseInt(row.count, 10);
    }

    // Full list of forbidden files so the UI can render a "upload these manually" section
    const forbiddenFiles = await sql`
      SELECT filename, canvas_course_id, canvas_module_id, error_message
      FROM app.canvas_imports
      WHERE user_id = ${user.user_id} AND status = 'forbidden'
      ORDER BY created_at DESC
    `;

    // Most recent 20 import events for an activity feed in the UI
    const recentActivity = await sql`
      SELECT filename, status, updated_at, error_message
      FROM app.canvas_imports
      WHERE user_id = ${user.user_id}
      ORDER BY updated_at DESC
      LIMIT 20
    `;

    return NextResponse.json({
      success: true,
      summary,
      forbidden: forbiddenFiles,
      recent: recentActivity,
    });

  } catch (err) {
    console.error('Canvas status error:', err);
    return NextResponse.json({ error: 'Failed to fetch import status' }, { status: 500 });
  }
}
