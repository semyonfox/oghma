// src/app/api/auth/password-reset/request/route.js

import crypto from 'crypto';
import sql from '@/database/pgsql.js';
import { sendPasswordResetEmail } from '@/lib/email.js';
import { createErrorResponse, parseJsonBody } from '@/lib/auth.js';
import {withCORS, optionsHandler} from "@/lib/corsHeaders.js";

export async function OPTIONS(request) {
  return optionsHandler(request);
}

/* Child function for debugging:
export async function GET(request) {
    console.log('Test route hit!');
    return new Response(JSON.stringify({ message: 'Test works!' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
}
*/


export async function POST(request) {
    try {
        const { data: body, error: parseError } = await parseJsonBody(request);
        if (parseError) return withCORS(parseError, request);

        const { email } = body;

        if (!email) {
            return withCORS(createErrorResponse('Email is required', 400, request));
        }

        // Find user
        const users = await sql`
      SELECT user_id, email 
      FROM app.login 
      WHERE email = ${email.trim()}
    `;

        // Always return success (security: don't reveal if email exists)
        if (users.length === 0) {
            return withCORS(new Response(
                JSON.stringify({ message: 'If that email exists, we sent a reset link' }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            ));
        }

        const user = users[0];

        // Generate random token
        const resetToken = crypto.randomBytes(32).toString('hex');

        // Token expires in 1 hour
        const expiresAt = new Date(Date.now() + 3600000);

        // Save token to database
        await sql`
      UPDATE app.login 
      SET reset_token = ${resetToken},
          reset_token_expires = ${expiresAt}
      WHERE user_id = ${user.user_id}
    `;

        // Send email
        await sendPasswordResetEmail(email, resetToken);

        return withCORS(new Response(
            JSON.stringify({ message: 'If that email exists, we sent a reset link' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        ));

    } catch (error) {
        console.error('Password reset request error:', error);
        return withCORS(createErrorResponse('Failed to send reset email', 500, request));
    }
}
