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
import { discoverCanvasCourses } from "@/lib/canvas/sync-courses.js";

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

export const GET = withErrorHandler(async () => {
  const user = await requireAuth();

  const credentials = await loadCanvasCredentials(user.user_id);
  if (!credentials) return noStoreJson({ connected: false });

  const client = new CanvasClient(credentials.domain, credentials.token);

  const [previousCourseRows, forbiddenCourseRows] = await Promise.all([
    sql`
      SELECT DISTINCT canvas_course_id
      FROM app.canvas_imports
      WHERE user_id = ${user.user_id}::uuid
        AND canvas_course_id IS NOT NULL
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
  let courseDiscoveryDegraded = false;
  try {
    const discovery = await discoverCanvasCourses(
      client,
      (previousCourseRows ?? []).map((row) => String(row.canvas_course_id)),
    );
    if (discovery.error) return noStoreJson({ connected: false });
    courses = discovery.data;
    courseDiscoveryDegraded = Boolean(discovery.degraded);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, "Canvas returned an invalid course ID");
  }

  return noStoreJson({
    connected: true,
    domain: credentials.domain,
    // Module/file discovery happens only once the user starts an import. A
    // settings-page refresh must not fan out one Canvas request per course.
    courses,
    courseDiscoveryDegraded,
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

  // Validate the token against Canvas before storing. The enrollment ledger is
  // the authoritative source; Canvas's regular course list omits some past,
  // pending, and inactive records.
  const client = new CanvasClient(normalizedDomain, normalizedToken);
  const previousCourseRows = await sql`
    SELECT DISTINCT canvas_course_id
    FROM app.canvas_imports
    WHERE user_id = ${user.user_id}::uuid
      AND canvas_course_id IS NOT NULL
  `;
  let normalizedCourses;
  let courseDiscoveryDegraded = false;
  try {
    const discovery = await discoverCanvasCourses(
      client,
      (previousCourseRows ?? []).map((row) => String(row.canvas_course_id)),
    );
    if (discovery.error) {
      throw new ApiError(400, `Canvas connection failed: ${discovery.error}`);
    }
    normalizedCourses = discovery.data;
    courseDiscoveryDegraded = Boolean(discovery.degraded);
  } catch (error) {
    if (error instanceof ApiError) throw error;
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
    courseDiscoveryDegraded,
  });
});
