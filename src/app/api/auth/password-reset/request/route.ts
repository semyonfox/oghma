import { after, type NextRequest } from "next/server";
import sql from "@/database/pgsql";
import { EmailSendError, sendPasswordResetEmail } from "@/lib/email";
import { createErrorResponse, parseJsonBody } from "@/lib/auth/session";
import { generateSecureToken, hashToken } from "@/lib/auth/tokens";
import { normalizeEmail } from "@/lib/auth/password-login";
import { waitForResponseFloor } from "@/lib/auth/response-floor";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";
import logger from "@/lib/logger";
import { ApiError, assertTrustedOrigin } from "@/lib/api-error";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

function resetAckResponse(): Response {
  return Response.json({ message: "If that email exists, we sent a reset link" });
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    assertTrustedOrigin(request);
    // the per-email rule alone lets one client mail every address on a list
    const ipLimited = await checkRateLimit("password-reset-ip", getClientIp(request));
    if (ipLimited) return ipLimited;

    const { data: body, error: parseError } = await parseJsonBody(request);
    if (parseError) return parseError;

    const rawEmail = typeof body?.email === "string" ? body.email : "";
    if (!rawEmail.trim()) return createErrorResponse("Email is required", 400);
    const email = normalizeEmail(rawEmail);

    const limited = await checkRateLimit("password-reset", email);
    if (limited) return limited;

    const startedAt = Date.now();
    const [user] = await sql<{ user_id: string; email: string }[]>`
      SELECT user_id, email FROM app.login
      WHERE lower(btrim(email)) = ${email}
        AND is_active = true AND deleted_at IS NULL
      LIMIT 1
    `;

    if (user) {
      const resetToken = generateSecureToken();
      await sql`
        UPDATE app.login
        SET reset_token = ${hashToken(resetToken)},
            reset_token_expires = ${new Date(Date.now() + RESET_TOKEN_TTL_MS)}
        WHERE user_id = ${user.user_id}::uuid
      `;
      after(async () => {
        try {
          await sendPasswordResetEmail(user.email, resetToken);
        } catch (error) {
          logger.error("password reset email failed", {
            reason: error instanceof EmailSendError ? error.reason : "unexpected",
            httpStatus: error instanceof EmailSendError ? error.httpStatus : undefined,
          });
        }
      });
    }

    await waitForResponseFloor(startedAt);
    return resetAckResponse();
  } catch (error) {
    if (error instanceof ApiError) {
      return createErrorResponse(error.userMessage, error.statusCode);
    }
    logger.error("password reset request error", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return createErrorResponse("Failed to send reset email", 500);
  }
}
