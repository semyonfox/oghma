import { type NextRequest } from "next/server";
import { createAuthSession } from "@/lib/auth";
import { ApiError, parseJsonObject, withErrorHandler } from "@/lib/api-error";
import {
  mobileAppLinksReady,
  MOBILE_AUTH_CODE_PATTERN,
  MOBILE_AUTH_CODE_VERIFIER_PATTERN,
  MobileAuthStoreUnavailableError,
  consumeMobileAuthGrant,
  findActiveMobileAuthUser,
} from "@/lib/mobile-auth";
import { checkRateLimit, getClientIp } from "@/lib/rateLimiter";

export const POST = withErrorHandler(async (request: NextRequest) => {
  if (!mobileAppLinksReady()) throw new ApiError(503, "Android App Links setup is incomplete");
  const limited = await checkRateLimit(
    "mobile-auth-exchange",
    getClientIp(request),
  );
  if (limited) return limited;

  const body = await parseJsonObject(request);
  const code = body.code;
  const codeVerifier = body.codeVerifier;
  if (
    typeof code !== "string" ||
    !MOBILE_AUTH_CODE_PATTERN.test(code) ||
    typeof codeVerifier !== "string" ||
    !MOBILE_AUTH_CODE_VERIFIER_PATTERN.test(codeVerifier)
  ) {
    throw new ApiError(400, "Invalid mobile authorization exchange");
  }

  let grant: Awaited<ReturnType<typeof consumeMobileAuthGrant>>;
  try {
    grant = await consumeMobileAuthGrant(code, codeVerifier);
  } catch (error) {
    if (error instanceof MobileAuthStoreUnavailableError) {
      throw new ApiError(503, "Service temporarily unavailable. Please try again shortly.");
    }
    throw error;
  }

  if (!grant) {
    throw new ApiError(400, "Invalid or expired authorization code");
  }

  const user = await findActiveMobileAuthUser(grant.userId);
  if (!user || user.session_version !== grant.sessionVersion) {
    throw new ApiError(403, "Account is unavailable");
  }

  const response = await createAuthSession(user, 30);
  response.headers.set("Cache-Control", "no-store");
  return response;
});
