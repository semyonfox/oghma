import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth.js';
import { CanvasClient } from '@/lib/canvas/client.js';
import sql from '@/database/pgsql.js';

/**
 * GET /api/canvas/connect
 *
 * Checks whether the current user has a stored Canvas connection and whether
 * the token is still valid. Returns courses on success so the UI can skip
 * straight to course selection without a separate round trip.
 *
 * Response:
 *   { connected: true,  domain: string, courses: Course[] }
 *   { connected: false }
 */
export async function GET() {
  try {
    const user = await validateSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rows = await sql`
      SELECT canvas_token, canvas_domain
      FROM app.login
      WHERE user_id = ${user.user_id}
    `;

    const { canvas_token, canvas_domain } = rows[0] ?? {};

    if (!canvas_token || !canvas_domain) {
      return NextResponse.json({ connected: false });
    }

    // Validate the stored token is still live by fetching courses
    const client = new CanvasClient(canvas_domain, canvas_token);
    const { data: courses, error } = await client.getCourses();

    if (error) {
      return NextResponse.json({ connected: false });
    }

    return NextResponse.json({
      connected: true,
      domain: canvas_domain,
      courses: courses ?? [],
    });

  } catch (err) {
    console.error('Canvas connection check error:', err);
    return NextResponse.json({ connected: false });
  }
}

/**
 * DELETE /api/canvas/connect
 *
 * Disconnects Canvas by clearing the stored token and domain
 * from the user's account.
 */
export async function DELETE() {
  try {
    const user = await validateSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await sql`
      UPDATE app.login
      SET canvas_token = NULL, canvas_domain = NULL
      WHERE user_id = ${user.user_id}
    `;

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error('Canvas disconnect error:', err);
    return NextResponse.json({ error: 'Failed to disconnect Canvas' }, { status: 500 });
  }
}

/**
 * POST /api/canvas/connect
 *
 * Validates a user-provided Canvas API token and domain, stores them against the user's account, and returns their active courses so the frontend can
 * immediately render the course selection screen without a second round trip.
 *
 * Body: { token: string, domain: string }
 * e.g.  { token: "1234~abc...", domain: "dcu.instructure.com" }
 */
export async function POST(request) {
  try {
    // Ensure the user is logged into Oghma before connecting Canvas
    const user = await validateSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { token, domain } = await request.json();

    if (!token || !domain) {
      return NextResponse.json(
        { error: 'Token and domain are required' },
        { status: 400 }
      );
    }

    // Use getCourses as a validation step — if Canvas rejects the token
    // we surface that immediately rather than storing a bad token in the DB
    const client = new CanvasClient(domain, token);
    const { data: courses, error } = await client.getCourses();

    if (error) {
      return NextResponse.json(
        { error: `Canvas connection failed: ${error}` },
        { status: 400 }
      );
    }

    // Token is valid — persist it against the user's account
    await sql`
      UPDATE app.login
      SET canvas_token = ${token}, canvas_domain = ${domain}
      WHERE user_id = ${user.user_id}
    `;

    // Return courses immediately so the UI can show the selection screen
    return NextResponse.json({
      success: true,
      courses: courses ?? [],
    });

  } catch (err) {
    console.error('Canvas connect error:', err);
    return NextResponse.json({ error: 'Failed to connect Canvas' }, { status: 500 });
  }
}
