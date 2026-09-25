import sql from "@/database/pgsql";
import { createErrorResponse, parseJsonBody } from "@/lib/auth";
import { generateSecureToken, hashToken } from "@/lib/tokens";
import { EmailSendError, sendVerificationEmail } from "@/lib/email";
import { checkRateLimit } from "@/lib/rateLimiter";
import logger from "@/lib/logger";
import { ApiError, assertTrustedOrigin } from "@/lib/api-error";
import { Locale, normalizeLocale } from "@/locales";
import type { NextRequest } from "next/server";

function ackResponse(): Response {
  return new Response(
    JSON.stringify({
      message: "If that email needs verification, a new link has been requested.",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    assertTrustedOrigin(request);
    const { data: body, error: parseError } = await parseJsonBody(request);
    if (parseError) return parseError;

    const email = typeof body?.email === "string" ? body.email : "";
    if (!email) return createErrorResponse("Email is required", 400);

    const limited = await checkRateLimit(
      "resend-verification",
      email.trim().toLowerCase(),
    );
    if (limited) return limited;

    const users = await sql<
      {
        user_id: string;
        email: string;
        email_verified: boolean;
        locale: string | null;
        verification_token: string | null;
        verification_token_expires: Date | null;
      }[]
    >`
            SELECT user_id, email, email_verified, locale,
              verification_token, verification_token_expires
            FROM app.login
            WHERE email = ${email.trim()}
        `;

    // constant-time: same work whether email exists or not
    const start = Date.now();
    const MIN_RESPONSE_MS = 500;

    if (users.length === 0 || users[0].email_verified === true) {
      // burn equivalent CPU time
      hashToken(generateSecureToken());
      const elapsed = Date.now() - start;
      if (elapsed < MIN_RESPONSE_MS) {
        await new Promise((r) =>
          setTimeout(r, MIN_RESPONSE_MS - elapsed + Math.random() * 100),
        );
      }
      return ackResponse();
    }

    const user = users[0];
    const verificationToken = generateSecureToken();
    const tokenHash = hashToken(verificationToken);
    const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const updated = await sql<{ user_id: string }[]>`
            UPDATE app.login
            SET verification_token = ${tokenHash}, verification_token_expires = ${tokenExpires}
            WHERE user_id = ${user.user_id}
              AND email_verified = false
              AND verification_token IS NOT DISTINCT FROM ${user.verification_token}
            RETURNING user_id
        `;
    if (updated.length === 0) return ackResponse();

    try {
      await sendVerificationEmail(
        email.trim(),
        verificationToken,
        normalizeLocale(user.locale) ?? Locale.EN,
      );
    } catch (sendError) {
      try {
        await sql`
          UPDATE app.login
          SET verification_token = ${user.verification_token},
            verification_token_expires = ${user.verification_token_expires}
          WHERE user_id = ${user.user_id}
            AND email_verified = false
            AND verification_token = ${tokenHash}
        `;
      } catch {
        logger.error("failed to restore verification token after resend failure");
      }
      throw sendError;
    }

    const elapsed = Date.now() - start;
    if (elapsed < MIN_RESPONSE_MS) {
      await new Promise((r) => setTimeout(r, MIN_RESPONSE_MS - elapsed));
    }
    return ackResponse();
  } catch (error) {
    if (error instanceof ApiError) {
      return createErrorResponse(error.userMessage, error.statusCode);
    }
    logger.error("resend verification error", {
      reason: error instanceof EmailSendError ? error.reason : "unexpected",
      httpStatus:
        error instanceof EmailSendError ? error.httpStatus : undefined,
      providerCode:
        error instanceof EmailSendError ? error.providerCode : undefined,
    });
    return createErrorResponse(
      "Could not request a verification link. Please try again later.",
      error instanceof EmailSendError ? 503 : 500,
    );
  }
}
