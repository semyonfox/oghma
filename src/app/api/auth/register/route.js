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
import { preWarmMarker } from "@/lib/marker-ec2";
import { checkRateLimit, getClientIp } from "@/lib/rateLimiter";
import bcrypt from "bcryptjs";
import logger from "@/lib/logger";
import { withErrorHandler } from "@/lib/api-error";
import { registerSchema, validateBody } from "@/lib/validations/schemas";

const GETTING_STARTED_TITLE = "Getting Started";
const GETTING_STARTED_CONTENT = `# Welcome to OghmaNotes

This note is your quick guide to getting value from the app.

## What OghmaNotes is

OghmaNotes is a study workspace where you can:

- Write and organize Markdown notes in folders
- Import course files from Canvas
- Ask AI questions about your material
- Generate study support like summaries and quizzes

## How to use it

1. Create notes and folders in the sidebar.
2. Open Settings to connect/import Canvas files.
3. Use AI Chat to ask questions about your notes.
4. Keep related content together so search and AI results stay accurate.

## Good first workflow

1. Create a folder per module/course.
2. Add weekly lecture notes.
3. Import lecture PDFs/slides.
4. Use AI Chat after each lecture for recap questions.

## Fun fact: Who is Oghma?

In Irish mythology, Oghma (or Ogma) is linked with eloquence, language, and learning, and is traditionally associated with the Ogham script.

You're ready to start building your study vault.`;

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

    const gettingStartedNoteId = generateUUID();

    // 7. Insert new user and seed starter note in one transaction
    const data = await sql.begin(async (tx) => {
      const createdUser = await tx`
        INSERT INTO app.login (user_id, email, hashed_password, email_verified, verification_token, verification_token_expires)
        VALUES (${userId}::uuid, ${email.trim()}, ${hashedPassword}, false, ${tokenHash}, ${tokenExpires})
        RETURNING user_id, email
      `;

      await tx`
        INSERT INTO app.notes (note_id, user_id, title, content, is_folder, deleted, created_at, updated_at)
        VALUES (${gettingStartedNoteId}::uuid, ${userId}::uuid, ${GETTING_STARTED_TITLE}, ${GETTING_STARTED_CONTENT}, false, 0, NOW(), NOW())
      `;

      await tx`
        INSERT INTO app.tree_items (user_id, note_id, parent_id)
        VALUES (${userId}::uuid, ${gettingStartedNoteId}::uuid, NULL)
      `;

      return createdUser;
    });

    const user = data[0];

    if (!user) {
      return createErrorResponse(
        "An error occurred while creating your account",
        500,
      );
    }

    // pre-warm Marker GPU — new users often import Canvas notes soon after signup
    // gives extra lead time vs waiting until Canvas is connected
    preWarmMarker();

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
