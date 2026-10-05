import bcrypt from "bcryptjs";
import { validateAuthCredentials } from "@/lib/auth/credentials";
import sql from "@/database/pgsql";
import {
  createAuthSession,
  createErrorResponse,
  parseJsonBody,
} from "@/lib/auth/session";
import { hashToken } from "@/lib/auth/tokens";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";
import logger from "@/lib/logger";
import { assertTrustedOrigin } from "@/lib/api-error";
import type { NextRequest } from "next/server";

interface VerificationCandidate {
  user_id: string;
  email: string;
  session_version: number;
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

    const password = typeof body?.password === "string" ? body.password : "";
    const validation = validateAuthCredentials("owner@example.test", password, true);
    if (!validation.isValid)
      return createErrorResponse(
        "Choose a strong password to finish verification",
        400,
      );

    // Mark the account and any agent registration claim atomically. If either
    // write fails, the verification token remains usable for a safe retry. The
    // conditional update also makes token consumption single-use under races.
    const matchedUser = await sql.begin(async (tx) => {
      const [candidate] = await tx<VerificationCandidate[]>`
        SELECT user_id, email, session_version FROM app.login
        WHERE verification_token = ${hashToken(token)}
          AND verification_token_expires > NOW() AND email_verified = false
          AND is_active = true AND deleted_at IS NULL FOR UPDATE
      `;
      if (!candidate) return null;
      // mailbox ownership replaces any password chosen by an unverified registrant
      const passwordHash = await bcrypt.hash(password, 10);
      const [user] = await tx<VerificationCandidate[]>`
        UPDATE app.login SET email_verified = true, hashed_password = ${passwordHash},
          verification_token = NULL, verification_token_expires = NULL,
          reset_token = NULL, reset_token_expires = NULL,
          session_version = session_version + 1
        WHERE user_id = ${candidate.user_id}::uuid AND verification_token = ${hashToken(token)}
        RETURNING user_id, email, session_version
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
    return await createAuthSession(matchedUser, 1);
  } catch (error) {
    logger.error("email verification error", { error });
    return createErrorResponse("Failed to verify email", 500);
  }
}
