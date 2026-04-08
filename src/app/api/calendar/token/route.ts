import { NextResponse } from "next/server";
import { withErrorHandler, requireAuth } from "@/lib/api-error";
import sql from "@/database/pgsql.js";

/**
 * GET /api/calendar/token
 * Returns the current iCal subscription token for the authenticated user.
 */
export const GET = withErrorHandler(async () => {
  const user = await requireAuth();

  const [row] = await sql`
    SELECT calendar_export_token FROM app.login
    WHERE user_id = ${user.user_id}::uuid
  `;

  return NextResponse.json({ token: row.calendar_export_token });
});

/**
 * POST /api/calendar/token
 * Regenerates the iCal subscription token, invalidating the previous URL.
 */
export const POST = withErrorHandler(async () => {
  const user = await requireAuth();

  const [row] = await sql`
    UPDATE app.login
    SET calendar_export_token = gen_random_uuid()
    WHERE user_id = ${user.user_id}::uuid
    RETURNING calendar_export_token
  `;

  return NextResponse.json({ token: row.calendar_export_token });
});
