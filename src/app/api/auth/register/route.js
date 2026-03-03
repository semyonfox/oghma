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
import bcrypt from "bcryptjs";
import {withCORS, optionsHandler} from "@/lib/corsHeaders.js";

export async function OPTIONS(request) {
  return optionsHandler(request);
}

export async function POST(request) {
    try {
        // 1. Parse and validate request body
        const {data: body, error: parseError} = await parseJsonBody(request);
        if (parseError) return withCORS(parseError, request);

        const {email, password} = body;

        // 2. Validate credentials format and password strength
        const validation = validateAuthCredentials(email, password, true);
        if (!validation.isValid) {
            return withCORS(createValidationErrorResponse(validation.errors, request));
        }

        // 3. Check if user already exists
        const existingUser = await sql`
            SELECT user_id
            FROM app.login
            WHERE email = ${email.trim()}
        `;

        if (existingUser.length > 0) {
            return withCORS(createErrorResponse('User already exists', 409, request));
        }

        // 4. Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // 5. Insert new user into database
        const data = await sql`
            INSERT INTO app.login (email, hashed_password)
            VALUES (${email.trim()}, ${hashedPassword}) RETURNING user_id, email
        `;

        const user = data[0];

        if (!user) {
            return withCORS(createErrorResponse('An error occurred while creating your account', 500, request));
        }

        // 6. Create auth session (generates JWT, sets cookie, returns response)
        return withCORS(await createAuthSession(user, 1, request));

    } catch (error) {
        console.error('Registration error:', error);
        return withCORS(createErrorResponse('Internal server error', 500, request));
    }
}
