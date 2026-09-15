import sql from "@/database/pgsql";
import {
  createAuthSession,
  createErrorResponse,
  parseJsonBody,
} from "@/lib/auth";
import { hashToken } from "@/lib/tokens";
import { checkRateLimit, getClientIp } from "@/lib/rateLimiter";
import logger from "@/lib/logger";
import { assertTrustedOrigin } from "@/lib/api-error";
import { recordActivationMilestone } from "@/lib/marketing/events";
import type { NextRequest } from "next/server";

interface VerificationCandidate {
  user_id: string;
  email: string;
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    assertTrustedOrigin(request);
    const limited = await checkRateLimit("verify-email", getClientIp(request));
    if (limited) return limited;

    const { data: body, error: parseError } = await parseJsonBody(request);
    if (parseError) return parseError;

    const token = typeof body?.token === "string" ? body.token : "";
    if (!token)
      return createErrorResponse("Verification token is required", 400);

    // Mark the account and any agent registration claim atomically. If either
    // write fails, the verification token remains usable for a safe retry. The
    // conditional update also makes token consumption single-use under races.
    const matchedUser = await sql.begin(async (tx) => {
      const [user] = await tx<VerificationCandidate[]>`
        UPDATE app.login
        SET email_verified = true,
            verification_token = NULL,
            verification_token_expires = NULL
        WHERE verification_token = ${hashToken(token)}
          AND verification_token_expires > NOW()
          AND email_verified = false
        RETURNING user_id, email
      `;
      if (!user) return null;

      await tx`
        UPDATE app.agent_registration_claims
        SET status = 'verified', verified_at = NOW()
        WHERE created_user_id = ${user.user_id}::uuid
          AND status = 'registered'
          AND expires_at > NOW()
      `;
      return user;
    });

    if (!matchedUser) {
      return createErrorResponse("Invalid or expired verification token", 400);
    }

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
