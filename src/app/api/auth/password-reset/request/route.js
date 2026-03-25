import crypto from 'crypto';
import sql from '@/database/pgsql.js';
import { sendPasswordResetEmail } from '@/lib/email.js';
import { createErrorResponse, parseJsonBody } from '@/lib/auth.js';
import { checkRateLimit } from '@/lib/rateLimiter';
import logger from '@/lib/logger';

function resetAckResponse() {
    return new Response(
        JSON.stringify({ message: 'If that email exists, we sent a reset link' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
}

export async function POST(request) {
    try {
        const { data: body, error: parseError } = await parseJsonBody(request);
        if (parseError) return parseError;

        const { email } = body;
        if (!email) return createErrorResponse('Email is required', 400);

        const limited = await checkRateLimit('password-reset', email.trim().toLowerCase());
        if (limited) return limited;

        const users = await sql`
            SELECT user_id, email FROM app.login WHERE email = ${email.trim()}
        `;

        // constant-time response whether or not the email exists (prevents enumeration)
        if (users.length === 0) {
            await new Promise(r => setTimeout(r, 150 + Math.random() * 100));
            return resetAckResponse();
        }

        const user = users[0];
        const resetToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 3600000);

        // hash before storing so a DB breach doesn't expose raw tokens
        const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

        await sql`
            UPDATE app.login
            SET reset_token = ${tokenHash}, reset_token_expires = ${expiresAt}
            WHERE user_id = ${user.user_id}
        `;

        await sendPasswordResetEmail(email, resetToken);
        return resetAckResponse();
    } catch (error) {
        logger.error('password reset request error', { error });
        return createErrorResponse('Failed to send reset email', 500);
    }
}
