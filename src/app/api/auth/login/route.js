/*
 * login Route Handler
 * Validates credentials, authenticates user, and creates session
 * 1. Validate request fields
 * 2. Query database for user
 * 3. Verify password
 * 4. Generate JWT token and create session
 * 5. Return success response
 */

import bcrypt from "bcryptjs";
import sql from "@/database/pgsql.js";
import {validateAuthCredentials} from "@/lib/validation.js";
import {createAuthSession, createErrorResponse, createValidationErrorResponse, parseJsonBody} from "@/lib/auth.js";
import {isRateLimited, recordFailedAttempt, clearFailedAttempts} from "@/lib/rateLimit.js";
import {isAccountLocked, recordFailedLogin, clearFailedLogins, getLockoutMinutesRemaining} from "@/lib/accountLockout.js";
import {withCORS, optionsHandler} from "@/lib/corsHeaders.js";

export async function OPTIONS(request) {
  return optionsHandler(request);
}

export async function POST(request) {
    try {
        // 1. Parse and validate request body
        const {data: body, error: parseError} = await parseJsonBody(request);
        if (parseError) return parseError;

        const {email, password} = body;

        // 2. Validate credentials format
        const validation = validateAuthCredentials(email, password, false);
        if (!validation.isValid) {
            return withCORS(createValidationErrorResponse(validation.errors));
        }

        // 3. Check if account is locked due to too many failed attempts
        if (isAccountLocked(email)) {
            const minutesRemaining = getLockoutMinutesRemaining(email);
            return withCORS(createErrorResponse(
                `Account temporarily locked. Try again in ${minutesRemaining} minute${minutesRemaining !== 1 ? 's' : ''}.`,
                429
            ));
        }

        // 4. Check rate limit (prevents brute force even with multiple accounts)
        if (isRateLimited(email)) {
            return withCORS(createErrorResponse(
                'Too many login attempts. Please try again later.',
                429
            ));
        }

        // 5. Query database for user
        const data = await sql`
            SELECT user_id, email, hashed_password
            FROM app.login
            WHERE email = ${email.trim()};
        `;

        const user = data[0];

        if (!user) {
            // Record failed attempt for security tracking
            recordFailedAttempt(email);
            recordFailedLogin(email);
            return withCORS(createErrorResponse('Invalid email or password', 401));
        }

        // 6. Verify password
        const matchingPassword = await bcrypt.compare(password, user.hashed_password);

        if (!matchingPassword) {
            // Record failed attempt for security tracking
            recordFailedAttempt(email);
            recordFailedLogin(email);
            return withCORS(createErrorResponse('Invalid email or password', 401));
        }

        // 7. Successful login - clear failed attempt counters
        clearFailedAttempts(email);
        clearFailedLogins(email);

        // 8. Create auth session (generates JWT, sets cookie, returns response)
        return withCORS(await createAuthSession(user, 1));

    } catch (error) {
        return withCORS(createErrorResponse('Internal server error', 500));
    }
}
