import { NextResponse } from 'next/server';
import { withErrorHandler, requireAuth, ApiError } from '@/lib/api-error';
import { CanvasClient } from '@/lib/canvas/client.js';
import { loadCanvasCredentials } from '@/lib/canvas/credentials';
import { canvasIdForBigintColumn } from '@/lib/canvas/id.js';

function upstreamCourseId(value) {
  try {
    return canvasIdForBigintColumn(value, 'Canvas course ID');
  } catch {
    throw new ApiError(502, 'Canvas returned an invalid course ID');
  }
}

/**
 * GET /api/canvas/courses
 *
 * Returns every Canvas course discoverable by the user with modules nested inside each course. Powers the course selection UI on the settings page so the
 * user can see what folder structure will be created before they import.
 *
 * Module fetches run concurrently across courses to keep the response fast.
 */
export const GET = withErrorHandler(async () => {
  const user = await requireAuth();

  // Retrieve stored Canvas credentials for this user
  const credentials = await loadCanvasCredentials(user.user_id);
  if (!credentials) {
    throw new ApiError(400, 'No Canvas account connected. Please add your API token in Settings.');
  }

  const client = new CanvasClient(credentials.domain, credentials.token);

  // Canvas exposes completed enrollments only through a separate state query.
  const { data: courses, error: coursesError } =
    await client.getDiscoverableCourses();

  if (coursesError) {
    throw new ApiError(400, coursesError);
  }

  // For each course, fetch its modules concurrently so the UI can show
  // the folder structure the import will create
  const moduleResults = await Promise.allSettled(
    (courses ?? []).map(async (course) => {
      const id = upstreamCourseId(course.id);
      const { data: modules } = await client.getModules(id);
      return {
        ...course,
        id,
        modules: modules ?? [],
      };
    })
  );

  const coursesWithModules = moduleResults.map((result, i) =>
    result.status === 'fulfilled'
      ? result.value
      : {
          ...(courses ?? [])[i],
          id: upstreamCourseId((courses ?? [])[i]?.id),
          modules: [],
        }
  );

  return NextResponse.json({
    success: true,
    courses: coursesWithModules,
  });
});
