/*
 * register Route Handler
 * Creates new user account with validated credentials
 * 1. Validate request fields and password strength
 * 2. Check if user already exists
 * 3. Hash password and insert new user
 * 4. Generate verification token and send email
 * 5. Return success response (requires verification)
 */

import { after, NextResponse, type NextRequest } from "next/server";
import sql from "@/database/pgsql";
import { validateAuthCredentials } from "@/lib/auth-credentials";
import {
  createErrorResponse,
  createValidationErrorResponse,
  parseJsonBody,
} from "@/lib/auth";
import { generateUUID } from "@/lib/utils/uuid";
import { generateSecureToken, hashToken } from "@/lib/tokens";
import {
  EmailSendError,
  sendVerificationEmail,
  type EmailDelivery,
} from "@/lib/email";
import { checkRateLimit, getClientIp } from "@/lib/rateLimiter";
import bcrypt from "bcryptjs";
import logger from "@/lib/logger";
import { withErrorHandler } from "@/lib/api-error";
import { recordMarketingEvent } from "@/lib/marketing/events";
import { registerSchema, validateBody } from "@/lib/validations/schemas";
import { validateAgentRegistrationForSignup } from "@/lib/agent-registration";
import {
  gettingStartedNoteTitle,
  renderGettingStartedNote,
} from "@/lib/chat/app-guide";
import { insertNoteWithTree } from "@/lib/notes/storage/create-note";
import { cleanAttribution } from "@/lib/marketing/attribution";
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

    // 3. Check if user already exists
    const existingUser = await sql`
            SELECT user_id
            FROM app.login
            WHERE email = ${email.trim()}
        `;

    if (existingUser.length > 0) {
      return createErrorResponse("User already exists", 409);
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
        VALUES (${userId}::uuid, ${email.trim()}, ${hashedPassword}, false, ${tokenHash}, ${tokenExpires}, ${locale}, ${gettingStartedNoteId}::uuid)
        RETURNING user_id, email
      `;

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
      return createErrorResponse(
        "An error occurred while creating your account",
        500,
      );
    }

    // 8. Send verification email
    let emailDelivery: EmailDelivery | "failed";
    try {
      emailDelivery = await sendVerificationEmail(
        email.trim(),
        verificationToken,
        locale,
      );
    } catch (emailErr) {
      emailDelivery = "failed";
      logger.error("failed to send verification email during registration", {
        reason:
          emailErr instanceof EmailSendError ? emailErr.reason : "unexpected",
        httpStatus:
          emailErr instanceof EmailSendError ? emailErr.httpStatus : undefined,
        providerCode:
          emailErr instanceof EmailSendError ? emailErr.providerCode : undefined,
      });
    }

    const rawMarketing =
      isRecord(rawBody) && isRecord(rawBody.marketing)
        ? rawBody.marketing
        : {};
    const marketingEvent = {
      eventName: "registration_success",
      sessionId: rawMarketing.sessionId,
      userId: user.user_id,
      path: "/register",
      source: "auth_register",
      utm: cleanAttribution(rawMarketing.utm),
      properties: {
        method: "email",
        requires_verification: true,
        email_delivery_attempted: true,
        email_delivery: emailDelivery,
        first_touch: rawMarketing.firstTouch,
      },
    };

    after(() =>
      recordMarketingEvent(
        marketingEvent,
        request,
      ).catch(() => {
        logger.warn("failed to record registration marketing event");
      }),
    );

    // 9. Return success with requiresVerification flag (no session created)
    return NextResponse.json(
      {
        success: true,
        requiresVerification: true,
        emailDelivery,
        message:
          emailDelivery === "failed"
            ? "Account created, but the verification email could not be sent. Try resending once or contact support."
            : emailDelivery === "queued"
              ? "Account created. Your verification email is queued."
              : "Account created. Check your email to verify your account.",
      },
      { status: 201 },
    );
  } catch (error) {
    const { code, detail } = databaseError(error);
    if (
      code === "23505" &&
      detail &&
      detail.includes("email")
    ) {
      return createErrorResponse("User already exists", 409);
    }
    throw error;
  }
});
