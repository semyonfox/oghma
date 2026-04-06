import { NextResponse } from "next/server";
import { withErrorHandler, requireAuth, ApiError } from "@/lib/api-error";
import sql from "@/database/pgsql.js";

const CONFIRM_PHRASE = "delete my account";

// how long we keep the data before a background job can hard-delete it
const GRACE_PERIOD_DAYS = 30;

/**
 * DELETE /api/auth/delete-account
 *
 * Soft-deletes the authenticated user's account:
 *   1. Validates session
 *   2. Requires body: { confirmation: "delete my account" }
 *   3. Sets is_active = false and deleted_at = now() on app.login
 *   4. Clears the session cookie — account is immediately inaccessible
 *
 * A background job (or manual process) can hard-delete rows where
 * deleted_at < now() - GRACE_PERIOD_DAYS after the grace period.
 * Until then the account can be recovered by contacting support.
 */
export const DELETE = withErrorHandler(async (request) => {
    const user = await requireAuth();

    // validate confirmation phrase
    let body: { confirmation?: string } = {};
    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "Invalid request body");
    }

    if (body.confirmation !== CONFIRM_PHRASE) {
      throw new ApiError(400, `Confirmation phrase must be exactly: "${CONFIRM_PHRASE}"`);
    }

    const userId = user.user_id;

    // soft-delete: mark inactive with a timestamp, data stays intact
    await sql`
      UPDATE app.login
      SET
        is_active   = false,
        deleted_at  = now()
      WHERE user_id = ${userId}::uuid
    `;

    // clear the session cookie — login attempts will now 401 because is_active = false
    const response = NextResponse.json({
      success: true,
      message: `Account scheduled for deletion. Data will be permanently removed after ${GRACE_PERIOD_DAYS} days.`,
    });

    response.cookies.set("session", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      expires: new Date(0),
      sameSite: "lax",
      path: "/",
    });

    return response;
});
