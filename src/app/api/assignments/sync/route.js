import { NextResponse } from "next/server";
import { withErrorHandler, requireAuth } from "@/lib/api-error";
import { CanvasClient } from "@/lib/canvas/client.js";
import { syncAssignmentMetadata } from "@/lib/canvas/sync-assignments.js";
import { cleanCourseName } from "@/lib/canvas/canvas-folders.js";
import { loadCanvasCredentials } from "@/lib/canvas/credentials";

/**
 * POST /api/assignments/sync
 *
 * On-demand sync of assignment metadata from Canvas.
 * Lightweight — no file downloads, just API calls + upserts.
 */
export const POST = withErrorHandler(async () => {
  const user = await requireAuth();

  const credentials = await loadCanvasCredentials(user.user_id);
  if (!credentials) {
    return NextResponse.json({
      synced: false,
      reason: "No Canvas account connected",
    });
  }

  const client = new CanvasClient(credentials.domain, credentials.token);

  const { data: allCourses, error } = await client.getCourses();
  if (error || !allCourses) {
    return NextResponse.json({
      synced: false,
      reason: error || "Failed to fetch courses",
    });
  }
  const courses = allCourses;

  let totalSynced = 0;
  let totalErrors = 0;

  for (const course of courses) {
    const { title: courseTitle } = cleanCourseName(
      course.course_code,
      course.name,
      course.term,
    );
    const { synced, errors } = await syncAssignmentMetadata(
      String(course.id),
      user.user_id,
      courseTitle,
      client,
    );
    totalSynced += synced;
    totalErrors += errors;
  }

  return NextResponse.json({
    synced: true,
    count: totalSynced,
    errors: totalErrors,
  });
});
