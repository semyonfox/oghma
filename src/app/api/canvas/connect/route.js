import { NextResponse } from "next/server";
import { withErrorHandler, requireAuth, ApiError } from "@/lib/api-error";
import { CanvasClient } from "@/lib/canvas/client.js";
import sql from "@/database/pgsql.js";
import { encrypt, decrypt } from "@/lib/crypto";
import { preWarmMarker } from "@/lib/marker-ec2";

const INSTRUCTURE_DOMAIN = /^[\w-]+\.instructure\.com$/i;

function isValidCanvasDomain(domain) {
  if (!domain || typeof domain !== "string") return false;
  return INSTRUCTURE_DOMAIN.test(domain.trim());
}

export const GET = withErrorHandler(async () => {
  const user = await requireAuth();

  const rows = await sql`
          SELECT canvas_token, canvas_domain FROM app.login WHERE user_id = ${user.user_id}
      `;
  const { canvas_token, canvas_domain } = rows[0] ?? {};
  if (!canvas_token || !canvas_domain)
    return NextResponse.json({ connected: false });

  // decrypt the stored token before using it
  const plainToken = decrypt(canvas_token, user.user_id);
  const client = new CanvasClient(canvas_domain, plainToken);
  const { data: courses, error } = await client.getCourses();

  if (error) return NextResponse.json({ connected: false });

  const coursesWithModules = await Promise.all(
    (courses ?? []).map(async (course) => {
      const { data: modules } = await client.getModules(course.id);
      return { ...course, modules: modules ?? [] };
    }),
  );

  return NextResponse.json({
    connected: true,
    domain: canvas_domain,
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

  const { token, domain } = await request.json();
  if (!token || !domain) {
    throw new ApiError(400, "Token and domain are required");
  }

  if (!isValidCanvasDomain(domain)) {
    throw new ApiError(400, "Domain must be a valid *.instructure.com address");
  }

  // validate the token against Canvas before storing
  const client = new CanvasClient(domain, token);
  const { data: courses, error } = await client.getCourses();
  if (error) {
    throw new ApiError(400, `Canvas connection failed: ${error}`);
  }

  // encrypt token before persisting
  const encryptedToken = encrypt(token, user.user_id);
  await sql`
          UPDATE app.login
          SET canvas_token = ${encryptedToken}, canvas_domain = ${domain}
          WHERE user_id = ${user.user_id}
      `;

  // pre-warm Marker GPU — user will likely import notes soon
  // fire-and-forget, never throws, gives ~90s head start before first import
  preWarmMarker();

  return NextResponse.json({ success: true, courses: courses ?? [] });
});
