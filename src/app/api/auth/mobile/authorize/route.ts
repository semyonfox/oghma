import { NextResponse, type NextRequest } from "next/server";
import { ApiError, parseJsonObject, withErrorHandler } from "@/lib/api-error";
import {
  MOBILE_AUTH_CODE_PATTERN,
  MOBILE_AUTH_STATE_PATTERN,
  MobileAuthStoreUnavailableError,
  getActiveAuthJsMobileUser,
  issueMobileAuthGrant,
} from "@/lib/mobile-auth";
import { checkRateLimit } from "@/lib/rateLimiter";

function json(data: object, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function requireBrowserOAuthUser() {
  const user = await getActiveAuthJsMobileUser();
  if (!user) throw new ApiError(401, "Unauthorized");
  return user;
}

export const GET = withErrorHandler(async () => {
  const user = await requireBrowserOAuthUser();
  return json({ user });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const body = await parseJsonObject(request);
  const state = body.state;
  const codeChallenge = body.codeChallenge;

  if (
    typeof state !== "string" ||
    !MOBILE_AUTH_STATE_PATTERN.test(state) ||
    typeof codeChallenge !== "string" ||
    !MOBILE_AUTH_CODE_PATTERN.test(codeChallenge)
  ) {
    throw new ApiError(400, "Invalid mobile authorization request");
  }

  const user = await requireBrowserOAuthUser();
  const limited = await checkRateLimit("mobile-auth-authorize", user.user_id);
  if (limited) return limited;

  try {
    const code = await issueMobileAuthGrant(user.user_id, codeChallenge);
    return json({
      url: `ie.oghmanotes.alpha://auth?code=${code}&state=${state}`,
    });
  } catch (error) {
    if (error instanceof MobileAuthStoreUnavailableError) {
      throw new ApiError(503, "Service temporarily unavailable. Please try again shortly.");
    }
    throw error;
  }
});
