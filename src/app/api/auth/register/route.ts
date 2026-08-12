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
import { validateAuthCredentials } from "@/lib/validation";
import {
  createErrorResponse,
  createValidationErrorResponse,
  parseJsonBody,
} from "@/lib/auth";
import { generateUUID } from "@/lib/utils/uuid";
import { generateSecureToken, hashToken } from "@/lib/tokens";
import { sendVerificationEmail } from "@/lib/email";
import { checkRateLimit, getClientIp } from "@/lib/rateLimiter";
import bcrypt from "bcryptjs";
import logger from "@/lib/logger";
import { withErrorHandler } from "@/lib/api-error";
import { recordMarketingEvent } from "@/lib/marketing/events";
import { registerSchema, validateBody } from "@/lib/validations/schemas";
import { validateAgentRegistrationForSignup } from "@/lib/agent-registration";
import { renderGettingStartedNote } from "@/lib/chat/app-guide";
import { insertNoteWithTree } from "@/lib/notes/storage/create-note";
import { cleanAttribution } from "@/lib/marketing/attribution";

const GETTING_STARTED_TITLE = "Getting Started";
const GETTING_STARTED_CONTENT = renderGettingStartedNote();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

    // 7. Insert new user and seed starter note in one transaction
    const data = await sql.begin(async (tx) => {
      const createdUser = await tx<{ user_id: string; email: string }[]>`
        INSERT INTO app.login (user_id, email, hashed_password, email_verified, verification_token, verification_token_expires)
        VALUES (${userId}::uuid, ${email.trim()}, ${hashedPassword}, false, ${tokenHash}, ${tokenExpires})
        RETURNING user_id, email
      `;

      await insertNoteWithTree(tx, {
        noteId: gettingStartedNoteId,
        userId,
        title: GETTING_STARTED_TITLE,
        content: GETTING_STARTED_CONTENT,
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
    try {
      await sendVerificationEmail(email.trim(), verificationToken);
    } catch (emailErr) {
      logger.error("failed to send verification email during registration", {
        error: errorMessage(emailErr),
      });
      // account is created but email failed -- user can resend later
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
        first_touch: rawMarketing.firstTouch,
      },
    };

    after(() =>
      recordMarketingEvent(
        marketingEvent,
        request,
      ).catch((eventError) => {
        logger.warn("failed to record registration marketing event", {
          error: errorMessage(eventError),
        });
      }),
    );

    // 9. Return success with requiresVerification flag (no session created)
    return NextResponse.json(
      {
        success: true,
        requiresVerification: true,
        message:
          "Account created. Please check your email to verify your account.",
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
