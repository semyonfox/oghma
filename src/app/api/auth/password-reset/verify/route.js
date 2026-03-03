// src/app/api/auth/password-reset/verify/route.js

import bcrypt from 'bcryptjs';
import sql from '@/database/pgsql.js';
import { createErrorResponse, parseJsonBody } from '@/lib/auth.js';
import { validateAuthCredentials } from '@/lib/validation.js';

export async function POST(request) {
    try {
        const { data: body, error: parseError } = await parseJsonBody(request);
        if (parseError) return parseError;

        const { token, password } = body;

        if (!token || !password) {
            return createErrorResponse('Token and password are required', 400);
        }

        // Validate new password strength
        const validation = validateAuthCredentials('dummy@email.com', password, true);
        if (!validation.isValid) {
            return new Response(
                JSON.stringify({ errors: validation.errors }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        // Find user with valid token
        const users = await sql`
      SELECT user_id, email 
      FROM public.login 
      WHERE reset_token = ${token}
        AND reset_token_expires > NOW()
    `;

        if (users.length === 0) {
            return createErrorResponse('Invalid or expired reset token', 400);
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

        return new Response(
            JSON.stringify({ message: 'Password reset successful' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('Password reset error:', error);
        return createErrorResponse('Failed to reset password', 500);
    }
}