import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth.js';
import { CanvasClient } from '@/lib/canvas/client.js';
import sql from '@/database/pgsql.js';
import { sqsClient, CANVAS_IMPORT_QUEUE_URL } from '@/lib/sqs';
import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { ensureWorkerRunning } from '@/lib/ecs';
import logger from '@/lib/logger';

/**
 * POST /api/canvas/import
 *
 * Queues a background import job for the selected courses.
 * The import-worker process picks this up and runs the full pipeline.
 *
 * Body: { courseIds: Array<{ id, name, course_code }> | string[] }
 *
 * Returns: { success: true, queued: true, jobId: uuid }
 */
export async function POST(request) {
  try {
    const user = await validateSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { courseIds } = await request.json();

    if (!Array.isArray(courseIds) || courseIds.length === 0) {
      return NextResponse.json({ error: 'courseIds array is required' }, { status: 400 });
    }

    const rows = await sql`
      SELECT canvas_token, canvas_domain
      FROM app.login
      WHERE user_id = ${user.user_id}
    `;

    const { canvas_token, canvas_domain } = rows[0] ?? {};

    if (!canvas_token || !canvas_domain) {
      return NextResponse.json({ error: 'No Canvas account connected' }, { status: 400 });
    }

    // Validate the token is still live before queuing
    const client = new CanvasClient(canvas_domain, canvas_token);
    const { data: courses, error: coursesError } = await client.getCourses();
    if (!courses && coursesError) {
      return NextResponse.json({ error: 'Canvas token is invalid or expired' }, { status: 401 });
    }

    // Cancel any existing queued/processing job and insert the new one atomically
    // so no worker can pick up the old job after we've already replaced it
    const job = await sql.begin(async sql => {
      await sql`
        UPDATE app.canvas_import_jobs
        SET status = 'cancelled', completed_at = NOW()
        WHERE user_id = ${user.user_id} AND status IN ('queued', 'processing')
      `;
      const [inserted] = await sql`
        INSERT INTO app.canvas_import_jobs (user_id, course_ids, status)
        VALUES (${user.user_id}::uuid, ${JSON.stringify(courseIds)}::jsonb, 'queued')
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
      // SQS send failed but the Postgres job record exists —
      // worker safety-net poll will pick it up, so don't fail the request
      logger.warn('SQS send failed (job still queued in DB)', { error: sqsErr.message });
    }

    return NextResponse.json({ success: true, queued: true, jobId });

  } catch (err) {
    logger.error('canvas import queue error', { error: err });
    return NextResponse.json({ error: 'Failed to queue import' }, { status: 500 });
  }
}
