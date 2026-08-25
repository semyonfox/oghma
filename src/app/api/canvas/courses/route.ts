import { NextResponse } from 'next/server';
import { withErrorHandler, requireAuth, ApiError } from '@/lib/api-error';
import { CanvasClient } from '@/lib/canvas/client';
import { loadCanvasCredentials } from '@/lib/canvas/credentials';
import { discoverCanvasCourses } from '@/lib/canvas/sync-courses';
import sql from '@/database/pgsql';

/**
 * GET /api/canvas/courses
 *
 * Returns every Canvas course discoverable by the user. Module and file
 * discovery is deliberately deferred until an import is queued, so a large
 * enrollment history does not trigger a request fan-out on page load.
 */
export const GET = withErrorHandler(async () => {
  const user = await requireAuth();

  // Retrieve stored Canvas credentials for this user
  const credentials = await loadCanvasCredentials(user.user_id);
  if (!credentials) {
    throw new ApiError(400, 'No Canvas account connected. Please add your API token in Settings.');
  }

  const client = new CanvasClient(credentials.domain, credentials.token);
  const previousCourseRows = await sql<{ canvas_course_id: string | number }[]>`
    SELECT DISTINCT canvas_course_id
    FROM app.canvas_imports
    WHERE user_id = ${user.user_id}::uuid
      AND canvas_course_id IS NOT NULL
  `;

  let courses;
  let courseDiscoveryDegraded = false;
  try {
    const discovery = await discoverCanvasCourses(
      client,
      (previousCourseRows ?? []).map((row) => String(row.canvas_course_id)),
    );
    if (discovery.error) {
      throw new ApiError(502, discovery.error);
    }
    courses = discovery.data;
    courseDiscoveryDegraded = Boolean(discovery.degraded);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, 'Canvas returned an invalid course ID');
  }
  return NextResponse.json({
    success: true,
    courses,
    courseDiscoveryDegraded,
  });
});
