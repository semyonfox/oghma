// src/app/api/auth/password-reset/verify/route.js

import bcrypt from 'bcryptjs';
import sql from '@/database/pgsql.js';
import { createErrorResponse, parseJsonBody } from '@/lib/auth.js';
import { validateAuthCredentials } from '@/lib/validation.js';
import { handleCORSPreflight, addCORSHeaders } from '@/lib/cors.js';

export async function OPTIONS(request) {
    return handleCORSPreflight(request);
}

export async function POST(request) {
    try {
        const { data: body, error: parseError } = await parseJsonBody(request);
        if (parseError) return addCORSHeaders(parseError, request);

        const { token, password } = body;

        if (!token || !password) {
            return addCORSHeaders(createErrorResponse('Token and password are required', 400), request);
        }

        // Validate new password strength
        const validation = validateAuthCredentials('dummy@email.com', password, true);
        if (!validation.isValid) {
            const response = new Response(
                JSON.stringify({ errors: validation.errors }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
            return addCORSHeaders(response, request);
        }

        // Find user with valid token
        const users = await sql`
      SELECT user_id, email 
      FROM public.login 
      WHERE reset_token = ${token}
        AND reset_token_expires > NOW()
    `;

        if (users.length === 0) {
            return addCORSHeaders(createErrorResponse('Invalid or expired reset token', 400), request);
        }

        const user = users[0];

        // Hash new password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Update password and clear reset token
        await sql`
      UPDATE public.login 
      SET hashed_password = ${hashedPassword},
          reset_token = NULL,
          reset_token_expires = NULL
      WHERE user_id = ${user.user_id}
    `;

        const successResponse = new Response(
            JSON.stringify({ message: 'Password reset successful' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
        return addCORSHeaders(successResponse, request);

    } catch (error) {
        console.error('Password reset error:', error);
        return addCORSHeaders(createErrorResponse('Failed to reset password', 500), request);
    }
}