import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth.js';
import { CanvasClient } from '@/lib/canvas/client.js';
import { syncAssignmentMetadata } from '@/lib/canvas/sync-assignments.js';
import { cleanCourseName } from '@/lib/canvas/canvas-folders.js';
import sql from '@/database/pgsql.js';
import { decrypt } from '@/lib/crypto';
import logger from '@/lib/logger';

/**
 * POST /api/assignments/sync
 *
 * On-demand sync of assignment metadata from Canvas.
 * Lightweight — no file downloads, just API calls + upserts.
 */
export async function POST() {
  try {
    const user = await validateSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const credRows = await sql`
      SELECT canvas_token, canvas_domain
      FROM app.login
      WHERE user_id = ${user.user_id}
    `;
    const { canvas_token, canvas_domain } = credRows[0] ?? {};

    if (!canvas_token || !canvas_domain) {
      return NextResponse.json({ synced: false, reason: 'No Canvas account connected' });
    }

    const plainToken = decrypt(canvas_token, user.user_id);
    const client = new CanvasClient(canvas_domain, plainToken);

    const { data: courses, error } = await client.getCourses();
    if (error || !courses) {
      return NextResponse.json({ synced: false, reason: error || 'Failed to fetch courses' });
    }

    let totalSynced = 0;
    let totalErrors = 0;

    for (const course of courses) {
      const { title: courseTitle } = cleanCourseName(course.course_code, course.name, course.term);
      const { synced, errors } = await syncAssignmentMetadata(
        String(course.id), user.user_id, courseTitle, client
      );
      totalSynced += synced;
      totalErrors += errors;
    }

    return NextResponse.json({ synced: true, count: totalSynced, errors: totalErrors });

  } catch (err) {
    logger.error('assignment sync error', { error: err?.message ?? err, stack: err?.stack });
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
