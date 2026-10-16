import { NextResponse } from "next/server";
import { withErrorHandler, requireAuth, ApiError } from "@/lib/api-error";
import sql from "@/database/pgsql";

interface TokenRow {
  calendar_export_token: string | null;
}

function tokenResponse(token: string) {
  // the token is a bearer credential for the public feed
  return NextResponse.json(
    { token },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

/**
 * GET /api/calendar/token
 * Returns the iCal subscription token, issuing one on first use. The column has
 * no default, so accounts start without a feed until they ask for it.
 */
export const GET = withErrorHandler(async () => {
  const user = await requireAuth();

  const [row] = await sql<TokenRow[]>`
    SELECT calendar_export_token FROM app.login
    WHERE user_id = ${user.user_id}::uuid
  `;
  if (!row) throw new ApiError(404, "Account not found");
  if (row.calendar_export_token) return tokenResponse(row.calendar_export_token);

  // COALESCE keeps a token issued by a concurrent request instead of rotating it
  const [issued] = await sql<TokenRow[]>`
    UPDATE app.login
    SET calendar_export_token = COALESCE(calendar_export_token, gen_random_uuid())
    WHERE user_id = ${user.user_id}::uuid
    RETURNING calendar_export_token
  `;
  if (!issued?.calendar_export_token) throw new ApiError(404, "Account not found");
  return tokenResponse(issued.calendar_export_token);
});

/**
 * POST /api/calendar/token
 * Regenerates the iCal subscription token, invalidating the previous URL.
 */
export const POST = withErrorHandler(async () => {
  const user = await requireAuth();

  const [row] = await sql<TokenRow[]>`
    UPDATE app.login
    SET calendar_export_token = gen_random_uuid()
    WHERE user_id = ${user.user_id}::uuid
    RETURNING calendar_export_token
  `;
  if (!row?.calendar_export_token) throw new ApiError(404, "Account not found");
  return tokenResponse(row.calendar_export_token);
});
