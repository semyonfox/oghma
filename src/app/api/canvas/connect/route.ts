import { after, NextResponse, type NextRequest } from "next/server";
import {
  withErrorHandler,
  requireAuth,
  ApiError,
  parseJsonObject,
} from "@/lib/api-error";
import { CanvasClient } from "@/lib/canvas/client";
import sql from "@/database/pgsql";
import { encrypt } from "@/lib/crypto";
import { checkRateLimit } from "@/lib/rateLimiter";
import { loadCanvasCredentials } from "@/lib/canvas/credentials";
import logger from "@/lib/logger";
import { recordMarketingEvent } from "@/lib/marketing/events";
import { discoverCanvasCourses } from "@/lib/canvas/sync-courses";
import { cleanAttribution } from "@/lib/marketing/attribution";

const INSTRUCTURE_DOMAIN = /^[\w-]+\.instructure\.com$/i;
const CANVAS_TOKEN_MAX_LENGTH = 4096;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isValidCanvasDomain(domain: unknown): domain is string {
  if (!domain || typeof domain !== "string") return false;
  return INSTRUCTURE_DOMAIN.test(domain.trim());
}

function noStoreJson(body: unknown, init?: ResponseInit): NextResponse {
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
    sql<{ canvas_course_id: string | number }[]>`
      SELECT DISTINCT canvas_course_id
      FROM app.canvas_imports
      WHERE user_id = ${user.user_id}::uuid
        AND canvas_course_id IS NOT NULL
    `,
    sql<{ canvas_course_id: string | number }[]>`
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

export const POST = withErrorHandler(async (request: NextRequest) => {
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
  const previousCourseRows = await sql<{ canvas_course_id: string | number }[]>`
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

  const marketingContext = isRecord(marketing) ? marketing : {};
  const marketingEvent = {
    eventName: "canvas_connect_success",
    sessionId: marketingContext.sessionId,
    userId: user.user_id,
    path: "/settings",
    source: "canvas_connect",
    utm: cleanAttribution(marketingContext.utm),
    properties: {
      location: "settings",
      course_count: normalizedCourses.length,
      first_touch: marketingContext.firstTouch,
    },
  };

  after(() =>
    recordMarketingEvent(
      marketingEvent,
      request,
    ).catch((eventError) => {
      logger.warn("failed to record canvas marketing event", {
        error: errorMessage(eventError),
      });
    }),
  );

  return noStoreJson({
    success: true,
    courses: normalizedCourses,
    courseDiscoveryDegraded,
  });
});
