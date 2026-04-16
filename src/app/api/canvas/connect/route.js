import { NextResponse } from "next/server";
import { withErrorHandler, requireAuth, ApiError } from "@/lib/api-error";
import { CanvasClient } from "@/lib/canvas/client.js";
import sql from "@/database/pgsql.js";
import { encrypt } from "@/lib/crypto";
import { preWarmMarker } from "@/lib/marker-ec2";
import { checkRateLimit } from "@/lib/rateLimiter";
import { loadCanvasCredentials } from "@/lib/canvas/credentials";

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
  const { data: courses, error } = await client.getCourses();

  if (error) return noStoreJson({ connected: false });

  const coursesWithModules = await Promise.all(
    (courses ?? []).map(async (course) => {
      const { data: modules } = await client.getModules(course.id);
      return { ...course, modules: modules ?? [] };
    }),
  );

  return noStoreJson({
    connected: true,
    domain: credentials.domain,
    courses: coursesWithModules,
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

  const { token, domain } = await request.json();
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
  const { data: courses, error } = await client.getCourses();
  if (error) {
    throw new ApiError(400, `Canvas connection failed: ${error}`);
  }

  // encrypt token before persisting
  const encryptedToken = encrypt(normalizedToken, user.user_id);
  await sql`
          UPDATE app.login
          SET canvas_token = ${encryptedToken}, canvas_domain = ${normalizedDomain}
          WHERE user_id = ${user.user_id}
      `;

  // pre-warm Marker GPU — user will likely import notes soon
  // fire-and-forget, never throws, gives ~90s head start before first import
  preWarmMarker();

  return noStoreJson({ success: true, courses: courses ?? [] });
});
