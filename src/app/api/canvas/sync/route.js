import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth.js';
import { CanvasClient } from '@/lib/canvas/client.js';
import sql from '@/database/pgsql.js';
import { sqsClient, CANVAS_IMPORT_QUEUE_URL } from '@/lib/sqs';
import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { ensureWorkerRunning } from '@/lib/ecs';
import { decrypt } from '@/lib/crypto';
import logger from '@/lib/logger';

/**
 * POST /api/canvas/sync
 *
 * Queues a resync job for all courses the user has previously imported from.
 * The import worker handles deduplication — only new files (canvas_file_id not
 * yet in canvas_imports with status='complete') will be downloaded.
 *
 * Returns { queued: true, jobId } or { queued: false, reason } if there is
 * nothing to sync (no prior imports or no canvas credentials).
 */
export async function POST(request) {
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
      return NextResponse.json({ queued: false, reason: 'No Canvas account connected' });
    }

    const plainToken = decrypt(canvas_token, user.user_id);

    // Derive the set of course IDs previously imported by this user
    const prevCourseRows = await sql`
      SELECT DISTINCT canvas_course_id
      FROM app.canvas_imports
      WHERE user_id = ${user.user_id}
    `;

    if (prevCourseRows.length === 0) {
      return NextResponse.json({ queued: false, reason: 'No previously imported courses' });
    }

    const prevCourseIds = new Set(prevCourseRows.map(r => String(r.canvas_course_id)));

    // Fetch current course list from Canvas to get up-to-date name / course_code
    const client = new CanvasClient(canvas_domain, plainToken);
    const { data: allCourses } = await client.getCourses();

    const courses = (allCourses ?? [])
      .filter(c => prevCourseIds.has(String(c.id)))
      .map(c => ({ id: c.id, name: c.name ?? String(c.id), course_code: c.course_code ?? '', term: c.term ?? null }));

    // Fall back to bare ID objects for any course no longer visible in Canvas
    for (const id of prevCourseIds) {
      if (!courses.some(c => String(c.id) === id)) {
        courses.push({ id: Number(id), name: String(id), course_code: '' });
      }
    }

    if (courses.length === 0) {
      return NextResponse.json({ queued: false, reason: 'No matching active courses found' });
    }

    // cancel any in-flight job and insert the sync atomically
    const job = await sql.begin(async sql => {
      await sql`
        UPDATE app.canvas_import_jobs
        SET status = 'cancelled', completed_at = NOW()
        WHERE user_id = ${user.user_id} AND status IN ('queued', 'processing')
      `;
      const [inserted] = await sql`
        INSERT INTO app.canvas_import_jobs (user_id, course_ids, status, job_type)
        VALUES (${user.user_id}::uuid, ${JSON.stringify(courses)}::jsonb, 'queued', 'sync')
        RETURNING id
      `;
      return inserted;
    });

    const jobId = job.id;

    try {
      await sqsClient.send(new SendMessageCommand({
        QueueUrl: CANVAS_IMPORT_QUEUE_URL,
        MessageBody: JSON.stringify({ jobId, userId: user.user_id }),
      }));
      await ensureWorkerRunning();
    } catch (sqsErr) {
      logger.warn('SQS send failed for sync (job still queued in DB)', { error: sqsErr.message });
    }

    return NextResponse.json({ queued: true, jobId });

  } catch (err) {
    logger.error('canvas sync error', { error: err });
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}

/**
 * GET /api/canvas/sync
 *
 * Returns whether a sync is available (user has canvas credentials + prior imports)
 * and whether a sync job is currently active.
 */
export async function GET(request) {
  try {
    const user = await validateSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [credRows, prevCourseRows, activeJobRows] = await Promise.all([
      sql`SELECT canvas_token, canvas_domain FROM app.login WHERE user_id = ${user.user_id}`,
      sql`SELECT COUNT(DISTINCT canvas_course_id)::int AS count FROM app.canvas_imports WHERE user_id = ${user.user_id}`,
      sql`
        SELECT id, status, created_at FROM app.canvas_import_jobs
        WHERE user_id = ${user.user_id} AND status IN ('queued', 'processing')
        ORDER BY created_at DESC LIMIT 1
      `,
    ]);

    const { canvas_token } = credRows[0] ?? {};
    const courseCount = prevCourseRows[0]?.count ?? 0;

    return NextResponse.json({
      available: !!(canvas_token && courseCount > 0),
      courseCount,
      activeJob: activeJobRows[0] ?? null,
    });

  } catch (err) {
    logger.error('canvas sync status error', { error: err });
    return NextResponse.json({ error: 'Failed to check sync status' }, { status: 500 });
  }
}
