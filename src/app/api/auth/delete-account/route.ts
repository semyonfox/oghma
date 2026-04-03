import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth.js";
import sql from "@/database/pgsql.js";
import logger from "@/lib/logger";

const CONFIRM_PHRASE = "delete my account";

/**
 * DELETE /api/auth/delete-account
 *
 * Schedules the account for deletion (GDPR Article 17 — 30-day grace period):
 *   1. Validates session and confirmation phrase
 *   2. Sets deleted_at = NOW() on app.login (soft-delete marker)
 *   3. Clears all session cookies — account is immediately inaccessible
 *   4. Returns the date when permanent deletion will occur (30 days out)
 *
 * Actual data erasure is performed by the cleanup job at
 *   POST /api/admin/cleanup-deleted-accounts
 * after the 30-day window expires.
 *
 * To recover the account during the grace period, call:
 *   POST /api/auth/cancel-deletion
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await validateSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // validate confirmation phrase
    let body: { confirmation?: string } = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    if (body.confirmation !== CONFIRM_PHRASE) {
      return NextResponse.json(
        { error: `Confirmation phrase must be exactly: "${CONFIRM_PHRASE}"` },
        { status: 400 },
      );
    }

    const userId = user.user_id;

    // mark account as scheduled for deletion — no data is erased yet
    await sql`
      UPDATE app.login
      SET deleted_at = NOW()
      WHERE user_id = ${userId}::uuid
    `;

    logger.info("delete-account: deletion scheduled", { userId });

    const scheduledDeletion = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const response = NextResponse.json({
      success: true,
      message:
        "Your account has been scheduled for deletion. You have 30 days to cancel this action by visiting the account recovery page.",
      scheduledDeletion,
    });

    // expire all session cookies immediately
    const expired = "Thu, 01 Jan 1970 00:00:00 UTC";
    const cookieNames = [
      "session",
      "authjs.session-token",
      "authjs.csrf-token",
      "authjs.callback-url",
      "__Secure-authjs.session-token",
      "__Secure-authjs.csrf-token",
      "__Secure-authjs.callback-url",
    ];
    for (const name of cookieNames) {
      response.headers.append(
        "Set-Cookie",
        `${name}=; Path=/; Expires=${expired}; HttpOnly; SameSite=Lax`,
      );
      response.headers.append(
        "Set-Cookie",
        `${name}=; Path=/; Expires=${expired}; HttpOnly; Secure; SameSite=Lax`,
      );
    }

    return response;
  } catch (err) {
    logger.error("delete-account error", { error: err });
    return NextResponse.json(
      { error: "Failed to schedule account deletion" },
      { status: 500 },
    );
  }
}
