import { NextResponse } from "next/server";
import { withErrorHandler, requireAuth } from "@/lib/api-error";
import { checkRateLimit } from "@/lib/rate-limiter";
import { CanvasClient } from "@/lib/canvas/client";
import { syncAssignmentMetadata } from "@/lib/canvas/sync-assignments";
import { cleanCourseName } from "@/lib/canvas/content-formatting";
import { loadCanvasCredentials } from "@/lib/canvas/credentials";
import {
  discoverCanvasCourses,
  isCanvasCourseImportable,
} from "@/lib/canvas/sync-courses";
import { recordCanvasCourseStatuses } from "@/lib/canvas/course-status";
import sql from "@/database/pgsql";

/**
 * POST /api/assignments/sync
 *
 * On-demand sync of assignment metadata from Canvas.
 * Lightweight — no file downloads, just API calls + upserts.
 */
export const POST = withErrorHandler(async () => {
  const user = await requireAuth();
  const limited = await checkRateLimit("assignments-sync", user.user_id);
  if (limited) return limited;

  const credentials = await loadCanvasCredentials(user.user_id);
  if (!credentials) {
    return NextResponse.json({
      synced: false,
      code: "not_connected",
      reason: "No Canvas account connected",
    });
  }

  const client = new CanvasClient(credentials.domain, credentials.token);

  const discovery = await discoverCanvasCourses(client);
  if (discovery.error) {
    return NextResponse.json({
      synced: false,
      code: discovery.unauthorized ? "reconnect" : "unavailable",
      reason: discovery.error,
    });
  }
  await recordCanvasCourseStatuses(user.user_id, discovery.data);
  // archived courses get no more updates
  const importable = discovery.data.filter(isCanvasCourseImportable);
  const active = await sql<{ id: string }[]>`
    SELECT id::text AS id FROM unnest(${importable.map((course) => String(course.id))}::bigint[]) AS id
    WHERE NOT app.course_archived(${user.user_id}::uuid, id)
  `;
  const activeIds = new Set(active.map((row) => row.id));
  const courses = importable.filter((course) => activeIds.has(String(course.id)));

  let totalSynced = 0;
  let totalErrors = 0;
  let totalRemoved = 0;

  for (const course of courses) {
    const { title: courseTitle } = cleanCourseName(
      course.course_code,
      course.name,
      course.term,
    );
    const { synced, errors, removed } = await syncAssignmentMetadata(
      String(course.id),
      user.user_id,
      courseTitle,
      client,
    );
    totalSynced += synced;
    totalErrors += errors;
    totalRemoved += removed;
  }

  return NextResponse.json({
    synced: true,
    count: totalSynced,
    errors: totalErrors,
    removed: totalRemoved,
  });
});
