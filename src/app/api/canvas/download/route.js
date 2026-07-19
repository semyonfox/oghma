import { NextResponse } from "next/server";
import { withErrorHandler, requireAuth, ApiError } from "@/lib/api-error";
import { CanvasClient } from "@/lib/canvas/client.js";
import { loadCanvasCredentials } from "@/lib/canvas/credentials";
import {
  createCanvasRawExportZipStream,
  discoverCanvasRawExportEntries,
} from "@/lib/canvas/raw-export.js";

export const runtime = "nodejs";

function canvasArchiveFilename() {
  const stamp = new Date().toISOString().slice(0, 10);
  return `canvas-export-${stamp}.zip`;
}

function pathWithQuery(path, params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) query.append(`${key}[]`, String(item));
    } else {
      query.set(key, String(value));
    }
  }
  const queryString = query.toString();
  return queryString ? `${path}?${queryString}` : path;
}

function normalizeCourse(course) {
  return typeof course === "object" && course !== null
    ? {
        id: course.id,
        name: course.name ?? String(course.id),
        course_code: course.course_code ?? "",
        term: course.term ?? null,
      }
    : { id: course, name: String(course), course_code: "", term: null };
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function discoverExportCourses(client) {
  const enrollmentStates = ["active", "invited_or_pending", "completed"];
  const coursesById = new Map();
  const skipped = [];
  const counts = {};

  for (const enrollmentState of enrollmentStates) {
    const { data, forbidden, error } = await client.getPaginatedPath(
      pathWithQuery("/courses", {
        enrollment_state: enrollmentState,
        include: ["term"],
      }),
    );

    if (forbidden || error) {
      skipped.push(
        `_course_discovery/${enrollmentState}: ${error ?? "restricted"}`,
      );
      counts[enrollmentState] = 0;
      continue;
    }

    counts[enrollmentState] = data.length;
    for (const course of data) {
      if (course?.id) coursesById.set(String(course.id), normalizeCourse(course));
    }
  }

  if (coursesById.size === 0) {
    const { data, forbidden, error } = await client.getPaginatedPath(
      pathWithQuery("/courses", { include: ["term"] }),
    );
    if (forbidden || error) {
      skipped.push(`_course_discovery/default: ${error ?? "restricted"}`);
    }
    for (const course of data ?? []) {
      if (course?.id) coursesById.set(String(course.id), normalizeCourse(course));
    }
    counts.default = data?.length ?? 0;
  }

  return {
    courses: [...coursesById.values()],
    skipped,
    courseDiscovery: {
      mode: "all_discoverable",
      enrollment_states: enrollmentStates,
      counts,
      course_count: coursesById.size,
    },
  };
}

export const POST = withErrorHandler(async (request) => {
  const user = await requireAuth();
  const body = await readJsonBody(request);

  const credentials = await loadCanvasCredentials(user.user_id);
  if (!credentials) {
    throw new ApiError(400, "No Canvas account connected");
  }

  const client = new CanvasClient(credentials.domain, credentials.token);
  const selectedCourses =
    Array.isArray(body.courseIds) && body.courseIds.length > 0
      ? {
          courses: body.courseIds.map(normalizeCourse),
          skipped: [],
          courseDiscovery: {
            mode: "selected",
            course_count: body.courseIds.length,
          },
        }
      : await discoverExportCourses(client);

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
