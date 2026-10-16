// password login for the web and Android clients; sets the custom `session` JWT cookie

import { NextResponse, type NextRequest } from "next/server";
import { validateAuthCredentials } from "@/lib/auth/credentials";
import {
  createAuthSession,
  createErrorResponse,
  createValidationErrorResponse,
  parseJsonBody,
} from "@/lib/auth/session";
import {
  getLockoutMinutesRemaining,
  isAuthLockoutStoreUnavailableError,
} from "@/lib/auth/login-lockout";
import {
  authenticatePassword,
  type PasswordLoginResult,
} from "@/lib/auth/password-login";
import { ApiError, withErrorHandler } from "@/lib/api-error";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";
import { loginSchema, validateBody } from "@/lib/validations/schemas";

async function lockedResponse(email: string): Promise<NextResponse> {
  const minutes = await getLockoutMinutesRemaining(email);
  if (minutes <= 0) {
    return createErrorResponse(
      "Too many login attempts. Please try again later.",
      429,
    );
  }
  return createErrorResponse(
    `Account temporarily locked. Try again in ${minutes} minute${minutes !== 1 ? "s" : ""}.`,
    429,
  );
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  const limited = await checkRateLimit("login", getClientIp(request));
  if (limited) return limited;

  const { data: body, error: parseError } = await parseJsonBody(request);
  if (parseError) return parseError;

  const zodResult = validateBody(loginSchema, body);
  if (!zodResult.success) return zodResult.response;

  const { email, password, rememberMe } = zodResult.data;

  const validation = validateAuthCredentials(email, password, false);
  if (!validation.isValid) {
    return createValidationErrorResponse(validation.errors);
  }

  let result: PasswordLoginResult;
  try {
    result = await authenticatePassword(email, password);
  } catch (error) {
    if (isAuthLockoutStoreUnavailableError(error))
      throw new ApiError(
        503,
        "Login protection is temporarily unavailable. Please try again shortly.",
      );
    throw error;
  }

  switch (result.status) {
    case "rate_limited":
      return lockedResponse(email);
    case "invalid":
      return createErrorResponse("Invalid email or password", 401);
    case "deactivated":
      return createErrorResponse(
        "This account has been deactivated. Contact support if this was a mistake.",
        403,
      );
    case "unverified":
      return NextResponse.json(
        {
          requiresVerification: true,
          email: result.email,
          message: "Please verify your email address before signing in.",
        },
        { status: 403 },
      );
    case "ok":
      return createAuthSession(result.user, rememberMe ? 30 : 1);
  }
});
