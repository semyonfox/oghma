import { after, NextResponse } from "next/server";
import {
  withErrorHandler,
  requireAuth,
  ApiError,
  parseJsonObject,
} from "@/lib/api-error";
import { CanvasClient } from "@/lib/canvas/client.js";
import sql from "@/database/pgsql.js";
import { encrypt } from "@/lib/crypto";
import { checkRateLimit } from "@/lib/rateLimiter";
import { loadCanvasCredentials } from "@/lib/canvas/credentials";
import logger from "@/lib/logger";
import { recordMarketingEvent } from "@/lib/marketing/events";
import { canvasIdForBigintColumn } from "@/lib/canvas/id.js";
import { resolveAccessibleCanvasCourses } from "@/lib/canvas/sync-courses.js";

const INSTRUCTURE_DOMAIN = /^[\w-]+\.instructure\.com$/i;
const CANVAS_TOKEN_MAX_LENGTH = 4096;

function isValidCanvasDomain(domain) {
  if (!domain || typeof domain !== "string") return false;
  return INSTRUCTURE_DOMAIN.test(domain.trim());
}

function noStoreJson(body, init) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function upstreamCourseId(value) {
  try {
    return canvasIdForBigintColumn(value, "Canvas course ID");
  } catch {
    throw new ApiError(502, "Canvas returned an invalid course ID");
  }
}

export const GET = withErrorHandler(async () => {
  const user = await requireAuth();

  const credentials = await loadCanvasCredentials(user.user_id);
  if (!credentials) return noStoreJson({ connected: false });

  const client = new CanvasClient(credentials.domain, credentials.token);
  const { data: visibleCourses, error } = await client.getDiscoverableCourses();

  if (error) return noStoreJson({ connected: false });

  const [previousCourseRows, forbiddenCourseRows] = await Promise.all([
    sql`
      SELECT DISTINCT canvas_course_id
      FROM app.canvas_imports
      WHERE user_id = ${user.user_id}::uuid
        AND canvas_course_id IS NOT NULL
      LIMIT 200
    `,
    sql`
      SELECT DISTINCT canvas_course_id
      FROM app.canvas_imports
      WHERE user_id = ${user.user_id}::uuid
        AND status = 'forbidden'
        AND canvas_course_id IS NOT NULL
    `,
  ]);

  let courses;
  try {
    courses = await resolveAccessibleCanvasCourses(
      client,
      visibleCourses,
      (previousCourseRows ?? []).map((row) => String(row.canvas_course_id)),
    );
  } catch {
    throw new ApiError(502, "Canvas returned an invalid course ID");
  }

  const coursesWithModules = await Promise.all(
    courses.map(async (course) => {
      const id = upstreamCourseId(course.id);
      const { data: modules } = await client.getModules(id);
      return { ...course, id, modules: modules ?? [] };
    }),
  );

  return noStoreJson({
    connected: true,
    domain: credentials.domain,
    courses: coursesWithModules,
    // This is the durable source of truth for the restricted course badge.
    // Keep IDs as decimal strings: Canvas IDs can exceed JavaScript's safe
    // integer range.
    forbiddenCourseIds: (forbiddenCourseRows ?? []).map((row) =>
      String(row.canvas_course_id),
    ),
  });
});

export const DELETE = withErrorHandler(async () => {
  const user = await requireAuth();

  await sql`
          UPDATE app.login SET canvas_token = NULL, canvas_domain = NULL
          WHERE user_id = ${user.user_id}
      `;
  return NextResponse.json({ success: true });
});

export const POST = withErrorHandler(async (request) => {
  const user = await requireAuth();
  const limited = await checkRateLimit("canvas-connect", user.user_id);
  if (limited) return limited;

  const { token, domain, marketing } = await parseJsonObject(request);
  const normalizedToken = typeof token === "string" ? token.trim() : "";
  const normalizedDomain =
    typeof domain === "string" ? domain.trim().toLowerCase() : "";

  if (!normalizedToken || !normalizedDomain) {
    throw new ApiError(400, "Token and domain are required");
  }

  if (normalizedToken.length > CANVAS_TOKEN_MAX_LENGTH) {
    throw new ApiError(400, "Canvas token is too long");
  }

  if (!isValidCanvasDomain(normalizedDomain)) {
    throw new ApiError(400, "Domain must be a valid *.instructure.com address");
  }

  // validate the token against Canvas before storing
  const client = new CanvasClient(normalizedDomain, normalizedToken);
  const { data: courses, error } = await client.getDiscoverableCourses();
  if (error) {
    throw new ApiError(400, `Canvas connection failed: ${error}`);
  }
  // Validate the course-list response before querying or storing anything.
  const visibleCourses = (courses ?? []).map((course) => ({
    ...course,
    id: upstreamCourseId(course.id),
  }));

  const previousCourseRows = await sql`
    SELECT DISTINCT canvas_course_id
    FROM app.canvas_imports
    WHERE user_id = ${user.user_id}::uuid
      AND canvas_course_id IS NOT NULL
    LIMIT 200
  `;
  let normalizedCourses;
  try {
    normalizedCourses = await resolveAccessibleCanvasCourses(
      client,
      visibleCourses,
      (previousCourseRows ?? []).map((row) => String(row.canvas_course_id)),
    );
  } catch {
    throw new ApiError(502, "Canvas returned an invalid course ID");
  }

  // encrypt token before persisting
  const encryptedToken = encrypt(normalizedToken, user.user_id);
  await sql`
          UPDATE app.login
          SET canvas_token = ${encryptedToken}, canvas_domain = ${normalizedDomain}
          WHERE user_id = ${user.user_id}
      `;

  after(() =>
    recordMarketingEvent(
      {
        eventName: "canvas_connect_success",
        sessionId: marketing?.sessionId,
        userId: user.user_id,
        path: "/settings",
        source: "canvas_connect",
        utm: marketing?.utm,
        properties: {
          location: "settings",
          course_count: normalizedCourses.length,
          first_touch: marketing?.firstTouch,
        },
      },
      request,
    ).catch((eventError) => {
      logger.warn("failed to record canvas marketing event", {
        error: eventError.message,
      });
    }),
  );

  return noStoreJson({
    success: true,
    courses: normalizedCourses,
  });
});
