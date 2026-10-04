/*
 * register Route Handler
 * Creates new user account with validated credentials
 * 1. Validate request fields and password strength
 * 2. Reserve the address without disclosing an existing account
 * 3. Hash password and insert new user
 * 4. Generate verification token and send email
 * 5. Return success response (requires verification)
 */

import { after, NextResponse, type NextRequest } from "next/server";
import sql from "@/database/pgsql";
import { validateAuthCredentials } from "@/lib/auth/credentials";
import {
  createErrorResponse,
  createValidationErrorResponse,
  parseJsonBody,
} from "@/lib/auth/session";
import { generateUUID } from "@/lib/utils/uuid";
import { generateSecureToken, hashToken } from "@/lib/auth/tokens";
import { EmailSendError, sendVerificationEmail } from "@/lib/email";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";
import bcrypt from "bcryptjs";
import logger from "@/lib/logger";
import { withErrorHandler } from "@/lib/api-error";
import { registerSchema, validateBody } from "@/lib/validations/schemas";
import { validateAgentRegistrationForSignup } from "@/lib/auth/agent-registration";
import {
  gettingStartedNoteTitle,
  renderGettingStartedNote,
} from "@/lib/chat/app-guide";
import { insertNoteWithTree } from "@/lib/notes/storage/create-note";
import { getRequestLocale } from "@/lib/i18n/server";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function databaseError(error: unknown): { code?: string; detail?: string } {
  if (!isRecord(error)) return {};
  return {
    code: typeof error.code === "string" ? error.code : undefined,
    detail: typeof error.detail === "string" ? error.detail : undefined,
  };
}

function registrationResponse() {
  return NextResponse.json(
    {
      success: true,
      requiresVerification: true,
      message:
        "If this address can be registered, check your email to verify your account. You can request another verification email if needed.",
    },
    { status: 201 },
  );
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  try {
    const limited = await checkRateLimit("register", getClientIp(request));
    if (limited) return limited;

    // 1. Parse and validate request body
    const { data: body, error: parseError } = await parseJsonBody(request);
    if (parseError) return parseError;

    // 1b. Validate input shape with Zod
    const rawBody: unknown = body;
    const zodResult = validateBody(registerSchema, rawBody);
    if (!zodResult.success) return zodResult.response;

    const { email, password, agentClaimToken, agentUserCode } = zodResult.data;

    // 2. Validate credentials format and password strength
    const validation = validateAuthCredentials(email, password, true);
    if (!validation.isValid) {
      return createValidationErrorResponse(validation.errors);
    }

    const agentClaim = agentClaimToken
      ? await validateAgentRegistrationForSignup(
          agentClaimToken,
          agentUserCode || "",
          email,
        )
      : null;
    if (agentClaimToken && !agentClaim) {
      return createErrorResponse(
        "Invalid, expired, or incomplete agent registration claim",
        400,
      );
    }

    // 4. Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 5. Generate UUID v7 for user
    const userId = generateUUID();

    // 6. Generate verification token
    const verificationToken = generateSecureToken();
    const tokenHash = hashToken(verificationToken);
    const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const gettingStartedNoteId = generateUUID();
    const locale = await getRequestLocale();

    // 7. Insert new user and seed starter note in one transaction
    const data = await sql.begin(async (tx) => {
      const createdUser = await tx<{ user_id: string; email: string }[]>`
        INSERT INTO app.login (user_id, email, hashed_password, email_verified, verification_token, verification_token_expires, locale, welcome_note_id)
        VALUES (${userId}::uuid, ${email.trim().toLowerCase()}, ${hashedPassword}, false, ${tokenHash}, ${tokenExpires}, ${locale}, ${gettingStartedNoteId}::uuid)
        ON CONFLICT ((lower(btrim(email)))) DO NOTHING
        RETURNING user_id, email
      `;

      if (!createdUser[0]) return createdUser;

      await insertNoteWithTree(tx, {
        noteId: gettingStartedNoteId,
        userId,
        title: gettingStartedNoteTitle(locale),
        content: renderGettingStartedNote(locale),
        isFolder: false,
      });

      if (agentClaim) {
        await tx`
          UPDATE app.agent_registration_claims
          SET status = 'registered', created_user_id = ${userId}::uuid, registered_at = NOW()
          WHERE id = ${agentClaim.id}::uuid AND status = 'pending'
        `;
      }

      return createdUser;
    });

    const user = data[0];

    if (!user) {
      return registrationResponse();
    }

    after(async () => {
      // 8. Send verification email
      try {
        await sendVerificationEmail(email.trim(), verificationToken, locale);
      } catch (emailErr) {
        logger.error("failed to send verification email during registration", {
          reason:
            emailErr instanceof EmailSendError ? emailErr.reason : "unexpected",
          httpStatus:
            emailErr instanceof EmailSendError ? emailErr.httpStatus : undefined,
          providerCode:
            emailErr instanceof EmailSendError ? emailErr.providerCode : undefined,
        });
      }
    });

    return registrationResponse();
  } catch (error) {
    const { code, detail } = databaseError(error);
    if (
      code === "23505" &&
      detail &&
      detail.includes("email")
    ) {
      return registrationResponse();
    }
    throw error;
  }
});
