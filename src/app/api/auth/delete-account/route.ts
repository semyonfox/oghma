import { NextResponse } from "next/server";
import { withErrorHandler, requireAuth, ApiError } from "@/lib/api-error";
import sql from "@/database/pgsql";
import { DELETED_ACCOUNT_GRACE_DAYS } from "@/lib/auth/account-purge";

const CONFIRM_PHRASE = "delete my account";

/**
 * DELETE /api/auth/delete-account
 *
 * Soft-deletes the authenticated user's account:
 *   1. Validates session
 *   2. Requires body: { confirmation: "delete my account" }
 *   3. Sets is_active = false and deleted_at = now() on app.login
 *   4. Clears the session cookie — account is immediately inaccessible
 *
 * The import worker purges rows once deleted_at is older than
 * DELETED_ACCOUNT_GRACE_DAYS (see lib/auth/account-purge.ts). Until then the
 * account can be recovered by contacting support, and its email stays taken.
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
        deleted_at  = now(),
        calendar_export_token = NULL,
        session_version = session_version + 1
      WHERE user_id = ${userId}::uuid
    `;

    // clear the session cookie — login attempts will now 401 because is_active = false
    const response = NextResponse.json({
      success: true,
      message: `Account scheduled for deletion. Data will be permanently removed after ${DELETED_ACCOUNT_GRACE_DAYS} days.`,
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
