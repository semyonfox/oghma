import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import sql from "@/database/pgsql.js";
import { createAuthSession, createErrorResponse } from "@/lib/auth.js";
import logger from "@/lib/logger";

/**
 * POST /api/auth/cancel-deletion
 *
 * Recovers an account that is within its 30-day deletion grace period.
 * The user must authenticate with email + password (their session is gone).
 *
 * Body: { email: string; password: string }
 *
 * Success: clears deleted_at, issues a new session cookie, returns user info.
 *
 * Error cases:
 *   400 — missing/invalid body, or OAuth-only account (no password)
 *   401 — wrong credentials
 *   403 — account has no pending deletion
 *   410 — grace period expired; permanent deletion has already run or is due
 */
export async function POST(request: NextRequest) {
  try {
    let body: { email?: string; password?: string } = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "email and password are required" },
        { status: 400 },
      );
    }

    // fetch account — include soft-deleted rows (deleted_at IS NOT NULL)
    // note: validateSession excludes deleted accounts, so we query directly
    const [user] = await sql`
      SELECT user_id, email, hashed_password, deleted_at
      FROM app.login
      WHERE email = ${email.trim().toLowerCase()}
    `;

    if (!user) {
      // same wording as login to avoid user enumeration
      return createErrorResponse("Invalid email or password", 401);
    }

    if (!user.deleted_at) {
      return NextResponse.json(
        { error: "This account does not have a pending deletion." },
        { status: 403 },
      );
    }

    // check grace period: deleted_at must be within the last 30 days
    const deletedAt = new Date(user.deleted_at);
    const gracePeriodEnd = new Date(
      deletedAt.getTime() + 30 * 24 * 60 * 60 * 1000,
    );
    if (Date.now() > gracePeriodEnd.getTime()) {
      return NextResponse.json(
        {
          error:
            "The 30-day recovery window has expired. This account has been permanently deleted.",
        },
        { status: 410 },
      );
    }

    // OAuth-only accounts have no password hash
    if (!user.hashed_password) {
      return NextResponse.json(
        {
          error:
            "This account uses OAuth login and cannot be recovered via password. Please contact support.",
        },
        { status: 400 },
      );
    }

    // verify password
    const passwordMatches = await bcrypt.compare(
      password,
      user.hashed_password,
    );
    if (!passwordMatches) {
      return createErrorResponse("Invalid email or password", 401);
    }

    // restore the account by clearing deleted_at
    await sql`
      UPDATE app.login
      SET deleted_at = NULL
      WHERE user_id = ${user.user_id}::uuid
    `;

    logger.info("cancel-deletion: account restored", { userId: user.user_id });

    // issue a new session (1-day default, same as login without rememberMe)
    return createAuthSession(user, 1);
  } catch (err) {
    logger.error("cancel-deletion error", { error: err });
    return NextResponse.json(
      { error: "Failed to cancel deletion" },
      { status: 500 },
    );
  }
}
