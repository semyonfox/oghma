import sql from "@/database/pgsql";
import { createErrorResponse, validateSession } from "@/lib/auth";
import { sendPasswordResetEmail } from "@/lib/email";
import { ApiError, assertTrustedOrigin } from "@/lib/api-error";
import logger from "@/lib/logger";
import { checkRateLimit } from "@/lib/rateLimiter";
import { generateSecureToken, hashToken } from "@/lib/tokens";
import type { NextRequest } from "next/server";

type PasswordAccount = {
  email: string;
  hashed_password: string | null;
};

export async function POST(request: NextRequest): Promise<Response> {
  try {
    assertTrustedOrigin(request);
    const user = await validateSession();
    if (!user) {
      return createErrorResponse("Unauthorized", 401);
    }

    const limited = await checkRateLimit("change-password", user.user_id);
    if (limited) return limited;

    const [account] = await sql<PasswordAccount[]>`
      SELECT email, hashed_password
      FROM app.login
      WHERE user_id = ${user.user_id}::uuid
        AND is_active = true
        AND deleted_at IS NULL
      LIMIT 1
    `;

    if (!account?.hashed_password) {
      return createErrorResponse(
        "Password sign-in is not enabled for this account",
        400,
      );
    }

    const resetToken = generateSecureToken();
    const tokenHash = hashToken(resetToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await sql`
      UPDATE app.login
      SET reset_token = ${tokenHash},
          reset_token_expires = ${expiresAt}
      WHERE user_id = ${user.user_id}::uuid
    `;

    await sendPasswordResetEmail(account.email, resetToken, "/change-password");

    return Response.json({
      success: true,
      message:
        "We sent a verification link to your email. Click the link to verify your account.",
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return createErrorResponse(error.userMessage, error.statusCode);
    }
    logger.error("change password error", { error });
    return createErrorResponse("Failed to change password", 500);
  }
}
