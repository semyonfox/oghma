/* * register Route Handler
 * Creates new user account with validated credentials
 * 1. Validate request fields and password strength
 * 2. Check if user already exists
 * 3. Hash password and insert new user
 * 4. Generate JWT token and create session
 * 5. Return success response
 */

// taken from authentication beta docs, nextJS on the 07/11/2025: https://nextjs.org/docs/app/guides/authentication
import sql from "@/database/pgsql.js";
import {validateAuthCredentials} from "@/lib/validation.js";
import {createAuthSession, createErrorResponse, createValidationErrorResponse, parseJsonBody} from "@/lib/auth.js";
import {generateUUID} from "@/lib/utils/uuid";
import {checkRateLimit, getClientIp} from "@/lib/rateLimiter";
import bcrypt from "bcryptjs";
import logger from '@/lib/logger';

export async function POST(request) {
    try {
        const limited = await checkRateLimit('register', getClientIp(request));
        if (limited) return limited;

        // 1. Parse and validate request body
        const {data: body, error: parseError} = await parseJsonBody(request);
        if (parseError) return parseError;

        const {email, password} = body;

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
            return createErrorResponse('User already exists', 409);
        }

        // 4. Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // 5. Generate UUID v7 for user
        const userId = generateUUID();

        // 6. Insert new user into database
        const data = await sql`
            INSERT INTO app.login (user_id, email, hashed_password)
            VALUES (${userId}::uuid, ${email.trim()}, ${hashedPassword}) RETURNING user_id, email
        `;

        const user = data[0];

        if (!user) {
            return createErrorResponse('An error occurred while creating your account', 500);
        }

        // 7. Create auth session (generates JWT, sets cookie, returns response)
        return await createAuthSession(user, 1);

    } catch (error) {
        logger.error('registration error', {
            message: error.message,
            code: error.code,
            detail: error.detail,
        });

        // Handle UNIQUE constraint violation on email (race condition fallback)
        // error.code = '23505' for PostgreSQL unique_violation
        if (error.code === '23505' && error.detail && error.detail.includes('email')) {
            return createErrorResponse('User already exists', 409);
        }

        return createErrorResponse('Internal server error', 500);
    }
}
