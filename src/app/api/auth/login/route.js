/*
 * login Route Handler
 * Validates credentials, authenticates user, and creates session
 * 1. Validate request fields
 * 2. Query database for user
 * 3. Verify password
 * 4. Generate JWT token and create session
 * 5. Return success response
 */

import bcrypt from "bcrypt";
import sql from "@/database/pgsql.js";
// taken from authentication beta docs, nextJS on the 07/11/2025: https://nextjs.org/docs/app/guides/authentication
import { validateAuthCredentials } from "@/lib/validation.js";
import {
    createAuthSession,
    createErrorResponse,
    createValidationErrorResponse,
    parseJsonBody
} from "@/lib/auth.js";

export async function POST(request) {
    try {
        // 1. Parse and validate request body
        const { data: body, error: parseError } = await parseJsonBody(request);
        if (parseError) return parseError;

        const { email, password } = body;

        // 2. Validate credentials format
        const validation = validateAuthCredentials(email, password, false);
        if (!validation.isValid) {
            return createValidationErrorResponse(validation.errors);
        }

        // 3. Query database for user
        const data = await sql`
            SELECT user_id, email, hashed_password 
            FROM public.login 
            WHERE email = ${email.trim()};
        `;

        const user = data[0];

        if (!user) {
            return createErrorResponse('Invalid email or password', 401);
        }

        // 4. Verify password
        const matchingPassword = await bcrypt.compare(password, user.hashed_password);

        if (!matchingPassword) {
            return createErrorResponse('Invalid email or password', 401);
        }

        // 5. Create auth session (generates JWT, sets cookie, returns response)
        return await createAuthSession(user, 1);

    } catch (error) {
        console.error('login error:', error);
        return createErrorResponse('Internal server error', 500);
    }
}