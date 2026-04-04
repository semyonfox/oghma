import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth.js";
import { CanvasClient } from "@/lib/canvas/client.js";
import sql from "@/database/pgsql.js";
import { encrypt, decrypt } from "@/lib/crypto";
import logger from "@/lib/logger";
import { preWarmMarker } from "@/lib/marker-ec2";

const INSTRUCTURE_DOMAIN = /^[\w-]+\.instructure\.com$/i;

function isValidCanvasDomain(domain) {
  if (!domain || typeof domain !== "string") return false;
  return INSTRUCTURE_DOMAIN.test(domain.trim());
}

async function getAuthUser() {
  const user = await validateSession();
  if (!user) return null;
  return user;
}

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  } catch (err) {
    logger.error("canvas connection check error", { error: err });
    return NextResponse.json({ connected: false });
  }
}

export async function DELETE() {
  try {
    const user = await getAuthUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await sql`
            UPDATE app.login SET canvas_token = NULL, canvas_domain = NULL
            WHERE user_id = ${user.user_id}
        `;
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("canvas disconnect error", { error: err });
    return NextResponse.json(
      { error: "Failed to disconnect Canvas" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const user = await getAuthUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { token, domain } = await request.json();
    if (!token || !domain) {
      return NextResponse.json(
        { error: "Token and domain are required" },
        { status: 400 },
      );
    }

    if (!isValidCanvasDomain(domain)) {
      return NextResponse.json(
        { error: "Domain must be a valid *.instructure.com address" },
        { status: 400 },
      );
    }

    // validate the token against Canvas before storing
    const client = new CanvasClient(domain, token);
    const { data: courses, error } = await client.getCourses();
    if (error) {
      return NextResponse.json(
        { error: `Canvas connection failed: ${error}` },
        { status: 400 },
      );
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
  } catch (err) {
    logger.error("canvas connect error", { error: err });
    return NextResponse.json(
      { error: "Failed to connect Canvas" },
      { status: 500 },
    );
  }
}
