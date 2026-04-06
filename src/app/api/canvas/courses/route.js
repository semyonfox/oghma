import { NextResponse } from 'next/server';
import { withErrorHandler, requireAuth, ApiError } from '@/lib/api-error';
import { CanvasClient } from '@/lib/canvas/client.js';
import sql from '@/database/pgsql.js';
import { decrypt } from '@/lib/crypto';

/**
 * GET /api/canvas/courses
 *
 * Returns the user's active Canvas courses with the modules nested inside each course. Powers the course selection UI on the settings page so the
 * user can see what folder structure will be created before they import.
 *
 * Module fetches run concurrently across courses to keep the response fast.
 */
export const GET = withErrorHandler(async () => {
  const user = await requireAuth();

  // Retrieve stored Canvas credentials for this user
  const rows = await sql`
    SELECT canvas_token, canvas_domain
    FROM app.login
    WHERE user_id = ${user.user_id}
  `;

  const { canvas_token, canvas_domain } = rows[0] ?? {};

  if (!canvas_token || !canvas_domain) {
    throw new ApiError(400, 'No Canvas account connected. Please add your API token in Settings.');
  }

  const plainToken = decrypt(canvas_token, user.user_id);
  const client = new CanvasClient(canvas_domain, plainToken);

  // Fetch all active courses the user is enrolled in as a student
  const { data: courses, error: coursesError } = await client.getCourses();

  if (coursesError) {
    throw new ApiError(400, coursesError);
  }

  // For each course, fetch its modules concurrently so the UI can show
  // the folder structure the import will create
  const moduleResults = await Promise.allSettled(
    (courses ?? []).map(async (course) => {
      const { data: modules } = await client.getModules(course.id);
      return {
        ...course,
        modules: modules ?? [],
      };
    })
  );

  const coursesWithModules = moduleResults.map((result, i) =>
    result.status === 'fulfilled'
      ? result.value
      : { ...(courses ?? [])[i], modules: [] }
  );

  return NextResponse.json({
    success: true,
    courses: coursesWithModules,
  });
});
