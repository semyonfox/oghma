/*
 * login Route Handler
 * Validates credentials, authenticates user, and creates session
 * 1. Validate request fields
 * 2. Query database for user
 * 3. Verify password
 * 4. Generate JWT token and create session
 * 5. Return success response
 */

import bcrypt from "bcryptjs";
import { NextResponse, type NextRequest } from "next/server";
import sql from "@/database/pgsql";
import { validateAuthCredentials } from "@/lib/auth-credentials";
import {
  createAuthSession,
  createErrorResponse,
  createValidationErrorResponse,
  parseJsonBody,
} from "@/lib/auth";
import {
  reserveLoginAttempt,
  clearFailedAttempts,
  isAccountLocked,
  getLockoutMinutesRemaining,
  isAuthLockoutStoreUnavailableError,
} from "@/lib/loginLockout";
import logger from "@/lib/logger";
import { ApiError, withErrorHandler } from "@/lib/api-error";
import { loginSchema, validateBody } from "@/lib/validations/schemas";

interface LoginUserRow {
  user_id: string;
  email: string;
  hashed_password: string;
  is_active: boolean;
  deleted_at: Date | string | null;
  email_verified: boolean;
  session_version: number;
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  // 1. Parse and validate request body
  const { data: body, error: parseError } = await parseJsonBody(request);
  if (parseError) return parseError;

  // 1b. Validate input shape with Zod
  const zodResult = validateBody(loginSchema, body);
  if (!zodResult.success) return zodResult.response;

  const { email, password, rememberMe } = zodResult.data;

  // 2. Validate credentials format
  const validation = validateAuthCredentials(email, password, false);
  if (!validation.isValid) {
    return createValidationErrorResponse(validation.errors);
  }

  try {
    // 3. Check if account is locked due to too many failed attempts
    if (await isAccountLocked(email)) {
      const minutesRemaining = await getLockoutMinutesRemaining(email);
      return createErrorResponse(
        `Account temporarily locked. Try again in ${minutesRemaining} minute${minutesRemaining !== 1 ? "s" : ""}.`,
        429,
      );
    }

    // 4. Check rate limit (prevents brute force even with multiple accounts)
    if (!(await reserveLoginAttempt(email))) {
      return createErrorResponse(
        "Too many login attempts. Please try again later.",
        429,
      );
    }
  } catch (error) {
    if (isAuthLockoutStoreUnavailableError(error))
      throw new ApiError(
        503,
        "Login protection is temporarily unavailable. Please try again shortly.",
      );
    throw error;
  }

  // 5. Query database for user
  const data = await sql<LoginUserRow[]>`
            SELECT user_id, email, hashed_password, is_active, deleted_at, email_verified, session_version
            FROM app.login
            WHERE lower(btrim(email)) = ${email.trim().toLowerCase()};
        `;

  const user = data[0];

  if (!user) {
    return createErrorResponse("Invalid email or password", 401);
  }

  // reject soft-deleted accounts
  if (user.is_active === false || user.deleted_at) {
    return createErrorResponse(
      "This account has been deactivated. Contact support if this was a mistake.",
      403,
    );
  }

  // Security check: verify that no duplicate emails exist. The UNIQUE constraint should prevent this.
  if (data.length > 1) {
    logger.error("security_event", { category: "duplicate_account_detected" });
    return createErrorResponse(
      "Account configuration error. Please contact support.",
      500,
    );
  }

  // 6. Verify password
  const matchingPassword = await bcrypt.compare(password, user.hashed_password);

  if (!matchingPassword) {
    return createErrorResponse("Invalid email or password", 401);
  }

  // 7b. Check email verification status
  if (user.email_verified === false) {
    return NextResponse.json(
      {
        requiresVerification: true,
        email: user.email,
        message: "Please verify your email address before signing in.",
      },
      { status: 403 },
    );
  }

  await clearFailedAttempts(email);

  // 8. Create auth session (generates JWT, sets cookie, returns response)
  const sessionResponse = await createAuthSession(user, rememberMe ? 30 : 1);

  return sessionResponse;
});
