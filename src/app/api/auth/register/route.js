/*
 * register Route Handler
 * Creates new user account with validated credentials
 * 1. Validate request fields and password strength
 * 2. Check if user already exists
 * 3. Hash password and insert new user
 * 4. Generate verification token and send email
 * 5. Return success response (requires verification)
 */

import sql from "@/database/pgsql.js";
import { validateAuthCredentials } from "@/lib/validation.js";
import {
  createErrorResponse,
  createValidationErrorResponse,
  parseJsonBody,
} from "@/lib/auth.js";
import { generateUUID } from "@/lib/utils/uuid";
import { generateSecureToken, hashToken } from "@/lib/tokens.js";
import { sendVerificationEmail } from "@/lib/email.js";
import { checkRateLimit, getClientIp } from "@/lib/rateLimiter";
import bcrypt from "bcryptjs";
import logger from "@/lib/logger";
import { withErrorHandler } from "@/lib/api-error";
import { registerSchema, validateBody } from "@/lib/validations/schemas";

export const POST = withErrorHandler(async (request) => {
  try {
    const limited = await checkRateLimit("register", getClientIp(request));
    if (limited) return limited;

    // 1. Parse and validate request body
    const { data: body, error: parseError } = await parseJsonBody(request);
    if (parseError) return parseError;

    // 1b. Validate input shape with Zod
    const zodResult = validateBody(registerSchema, body);
    if (!zodResult.success) return zodResult.response;

    const { email, password } = body;

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

    // 4. Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 5. Generate UUID v7 for user
    const userId = generateUUID();

    // 6. Generate verification token
    const verificationToken = generateSecureToken();
    const tokenHash = hashToken(verificationToken);
    const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // 7. Insert new user with email_verified = false
    const data = await sql`
            INSERT INTO app.login (user_id, email, hashed_password, email_verified, verification_token, verification_token_expires)
            VALUES (${userId}::uuid, ${email.trim()}, ${hashedPassword}, false, ${tokenHash}, ${tokenExpires})
            RETURNING user_id, email
        `;

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
        error: emailErr.message,
      });
      // account is created but email failed -- user can resend later
    }

    // 9. Return success with requiresVerification flag (no session created)
    return new Response(
      JSON.stringify({
        success: true,
        requiresVerification: true,
        message:
          "Account created. Please check your email to verify your account.",
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    if (
      error.code === "23505" &&
      error.detail &&
      error.detail.includes("email")
    ) {
      return createErrorResponse("User already exists", 409);
    }
    throw error;
  }
});
