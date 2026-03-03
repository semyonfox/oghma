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
import {handleCORSPreflight, addCORSHeaders} from "@/lib/cors.js";

export async function OPTIONS(request) {
    return handleCORSPreflight(request);
}

export async function POST(request) {
    try {
        // 1. Parse and validate request body
        const {data: body, error: parseError} = await parseJsonBody(request);
        if (parseError) return addCORSHeaders(parseError, request);

        const {email, password} = body;

        // 2. Validate credentials format
        const validation = validateAuthCredentials(email, password, false);
        if (!validation.isValid) {
            return addCORSHeaders(createValidationErrorResponse(validation.errors), request);
        }

        // 3. Check if account is locked due to too many failed attempts
        if (isAccountLocked(email)) {
            const minutesRemaining = getLockoutMinutesRemaining(email);
            return addCORSHeaders(createErrorResponse(
                `Account temporarily locked. Try again in ${minutesRemaining} minute${minutesRemaining !== 1 ? 's' : ''}.`,
                429
            ), request);
        }

        // 4. Check rate limit (prevents brute force even with multiple accounts)
        if (isRateLimited(email)) {
            return addCORSHeaders(createErrorResponse(
                'Too many login attempts. Please try again later.',
                429
            ), request);
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
            return addCORSHeaders(createErrorResponse('Invalid email or password', 401), request);
        }

        // 6. Verify password
        const matchingPassword = await bcrypt.compare(password, user.hashed_password);

        if (!matchingPassword) {
            // Record failed attempt for security tracking
            recordFailedAttempt(email);
            recordFailedLogin(email);
            return addCORSHeaders(createErrorResponse('Invalid email or password', 401), request);
        }

        // 7. Successful login - clear failed attempt counters
        clearFailedAttempts(email);
        clearFailedLogins(email);

        // 8. Create auth session (generates JWT, sets cookie, returns response)
        const authResponse = await createAuthSession(user, 1);
        return addCORSHeaders(authResponse, request);

    } catch (error) {
        console.error('Login error:', error.message, error.stack);
        return addCORSHeaders(createErrorResponse('Internal server error', 500), request);
    }
}
