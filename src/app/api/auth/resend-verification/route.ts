import { after, type NextRequest } from "next/server";
import sql from "@/database/pgsql";
import { createErrorResponse, parseJsonBody } from "@/lib/auth/session";
import { generateSecureToken, hashToken } from "@/lib/auth/tokens";
import { normalizeEmail } from "@/lib/auth/password-login";
import { waitForResponseFloor } from "@/lib/auth/response-floor";
import { EmailSendError, sendVerificationEmail } from "@/lib/email";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";
import logger from "@/lib/logger";
import { ApiError, assertTrustedOrigin } from "@/lib/api-error";
import { Locale, normalizeLocale } from "@/locales";

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

interface PendingVerification {
  user_id: string;
  email: string;
  locale: string | null;
  verification_token: string | null;
  verification_token_expires: Date | null;
}

function ackResponse(): Response {
  return Response.json({
    message: "If that email needs verification, a new link has been requested.",
  });
}

// the previous link keeps working when the provider rejects the new one
async function sendOrRestore(
  user: PendingVerification,
  verificationToken: string,
  tokenHash: string,
): Promise<void> {
  try {
    await sendVerificationEmail(
      user.email,
      verificationToken,
      normalizeLocale(user.locale) ?? Locale.EN,
    );
  } catch (sendError) {
    try {
      await sql`
        UPDATE app.login
        SET verification_token = ${user.verification_token},
          verification_token_expires = ${user.verification_token_expires}
        WHERE user_id = ${user.user_id}::uuid
          AND email_verified = false
          AND verification_token = ${tokenHash}
      `;
    } catch (error) {
      logger.error("failed to restore verification token after resend failure", { error });
    }
    logger.error("resend verification email failed", {
      reason:
        sendError instanceof EmailSendError ? sendError.reason : "unexpected",
      httpStatus:
        sendError instanceof EmailSendError ? sendError.httpStatus : undefined,
      providerCode:
        sendError instanceof EmailSendError ? sendError.providerCode : undefined,
    });
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    assertTrustedOrigin(request);
    // the per-email rule alone lets one client mail every address on a list
    const ipLimited = await checkRateLimit("resend-verification-ip", getClientIp(request));
    if (ipLimited) return ipLimited;

    const { data: body, error: parseError } = await parseJsonBody(request);
    if (parseError) return parseError;

    const rawEmail = typeof body?.email === "string" ? body.email : "";
    if (!rawEmail.trim()) return createErrorResponse("Email is required", 400);
    const email = normalizeEmail(rawEmail);

    const limited = await checkRateLimit("resend-verification", email);
    if (limited) return limited;

    const startedAt = Date.now();
    const [user] = await sql<PendingVerification[]>`
      SELECT user_id, email, locale, verification_token, verification_token_expires
      FROM app.login
      WHERE lower(btrim(email)) = ${email}
        AND email_verified = false
        AND is_active = true AND deleted_at IS NULL
      LIMIT 1
    `;

    if (user) {
      const verificationToken = generateSecureToken();
      const tokenHash = hashToken(verificationToken);
      // compare-and-set so two concurrent resends can't both mail a live link
      const updated = await sql<{ user_id: string }[]>`
        UPDATE app.login
        SET verification_token = ${tokenHash},
          verification_token_expires = ${new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS)}
        WHERE user_id = ${user.user_id}::uuid
          AND email_verified = false
          AND verification_token IS NOT DISTINCT FROM ${user.verification_token}
        RETURNING user_id
      `;
      if (updated.length > 0) {
        after(() => sendOrRestore(user, verificationToken, tokenHash));
      }
    }

    await waitForResponseFloor(startedAt);
    return ackResponse();
  } catch (error) {
    if (error instanceof ApiError) {
      return createErrorResponse(error.userMessage, error.statusCode);
    }
    logger.error("resend verification error", { reason: "unexpected" });
    return createErrorResponse(
      "Could not request a verification link. Please try again later.",
      500,
    );
  }
}
