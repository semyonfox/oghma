import sql from "@/database/pgsql.js";
import {
  createAuthSession,
  createErrorResponse,
  parseJsonBody,
} from "@/lib/auth";
import { verifyTokenHash } from "@/lib/tokens";
import { checkRateLimit, getClientIp } from "@/lib/rateLimiter";
import logger from "@/lib/logger";
import { assertTrustedOrigin } from "@/lib/api-error";
import { recordActivationMilestone } from "@/lib/marketing/events";

export async function POST(request) {
  try {
    assertTrustedOrigin(request);
    const limited = await checkRateLimit("verify-email", getClientIp(request));
    if (limited) return limited;

    const { data: body, error: parseError } = await parseJsonBody(request);
    if (parseError) return parseError;

    const { token } = body;
    if (!token)
      return createErrorResponse("Verification token is required", 400);

    // find users with unexpired verification tokens
    const users = await sql`
            SELECT user_id, email, verification_token
            FROM app.login
            WHERE verification_token IS NOT NULL
              AND verification_token_expires > NOW()
              AND email_verified = false
        `;

    // check the token hash against each candidate
    const matchedUser = users.find((u) =>
      verifyTokenHash(token, u.verification_token),
    );

    if (!matchedUser) {
      return createErrorResponse("Invalid or expired verification token", 400);
    }

    // Mark the account and any agent registration claim atomically. If either
    // write fails, the verification token remains usable for a safe retry.
    await sql.begin(async (tx) => {
      await tx`
            UPDATE app.login
            SET email_verified = true, verification_token = NULL, verification_token_expires = NULL
            WHERE user_id = ${matchedUser.user_id}
      `;
      await tx`
        UPDATE app.agent_registration_claims
        SET status = 'verified', verified_at = NOW()
        WHERE created_user_id = ${matchedUser.user_id}::uuid
          AND status = 'registered'
          AND expires_at > NOW()
      `;
    });

    // auto-login: create session for the verified user
    void recordActivationMilestone("email_verified", matchedUser.user_id, request).catch(
      (eventError) => logger.warn("failed to record email verification milestone", { error: eventError.message }),
    );
    return await createAuthSession(matchedUser, 1);
  } catch (error) {
    logger.error("email verification error", { error });
    return createErrorResponse("Failed to verify email", 500);
  }
}
