import { NextResponse } from "next/server";
import {
  withErrorHandler,
  requireAuth,
  ApiError,
  parseJsonObject,
} from "@/lib/api-error";
import { CanvasClient } from "@/lib/canvas/client.js";
import { loadCanvasCredentials } from "@/lib/canvas/credentials";
import {
  createCanvasRawExportZipStream,
  discoverCanvasRawExportEntries,
} from "@/lib/canvas/raw-export.js";
import { normalizeCanvasCourseSelection } from "@/lib/canvas/id.js";
import {
  discoverCanvasCourses,
  isCanvasCourseImportable,
} from "@/lib/canvas/sync-courses.js";

export const runtime = "nodejs";

function canvasArchiveFilename() {
  const stamp = new Date().toISOString().slice(0, 10);
  return `canvas-export-${stamp}.zip`;
}

async function discoverExportCourses(client) {
  const discovery = await discoverCanvasCourses(client);
  if (discovery.error) {
    throw new Error(discovery.error);
  }

  const importableCourses = discovery.data.filter(isCanvasCourseImportable);
  const unavailableCourses = discovery.data.filter(
    (course) => !isCanvasCourseImportable(course),
  );

  return {
    courses: importableCourses.map(normalizeCanvasCourseSelection),
    skipped: unavailableCourses.map(
      (course) =>
        `_course_discovery/${course.id}: ${
          course.canvasStatusReason ?? course.canvasStatus
        }`,
    ),
    courseDiscovery: {
      mode: "enrollment_ledger",
      course_count: importableCourses.length,
      unavailable_course_count: unavailableCourses.length,
      degraded: Boolean(discovery.degraded),
    },
  };
}

export const POST = withErrorHandler(async (request) => {
  const user = await requireAuth();
  const body = await parseJsonObject(request);

  const credentials = await loadCanvasCredentials(user.user_id);
  if (!credentials) {
    throw new ApiError(400, "No Canvas account connected");
  }

  const client = new CanvasClient(credentials.domain, credentials.token);
  let selectedCourses;
  const hasCourseIds = Object.prototype.hasOwnProperty.call(body, "courseIds");
  if (
    hasCourseIds &&
    (!Array.isArray(body.courseIds) || body.courseIds.length === 0)
  ) {
    throw new ApiError(400, "courseIds must be a non-empty array when provided");
  }
  if (hasCourseIds) {
    try {
      selectedCourses = {
        courses: body.courseIds.map(normalizeCanvasCourseSelection),
        skipped: [],
        courseDiscovery: {
          mode: "selected",
          course_count: body.courseIds.length,
        },
      };
    } catch (error) {
      throw new ApiError(
        400,
        error instanceof Error ? error.message : "Invalid Canvas course ID",
      );
    }
  } else {
    try {
      selectedCourses = await discoverExportCourses(client);
    } catch (error) {
      throw new ApiError(
        502,
        `Canvas course discovery failed: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }

  if (selectedCourses.courses.length === 0) {
    throw new ApiError(404, "No Canvas courses found");
  }

  const archive = await discoverCanvasRawExportEntries(
    client,
    selectedCourses.courses,
    {
      skipped: selectedCourses.skipped,
      courseDiscovery: selectedCourses.courseDiscovery,
    },
  );

  if (
    archive.downloads.length === 0 &&
    archive.textEntries.length === 0 &&
    archive.skipped.length === 0
  ) {
    throw new ApiError(404, "No downloadable Canvas content found");
  }

  const stream = createCanvasRawExportZipStream(client, archive);

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${canvasArchiveFilename()}"`,
      "Cache-Control": "no-store",
    },
  });
});
