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

        // constant-time: perform the same work regardless of whether email exists
        // this prevents timing-based account enumeration
        const start = Date.now();
        const MIN_RESPONSE_MS = 500;

        if (users.length === 0) {
            // burn time equivalent to the real path (hash + dummy work)
            crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex');
            const elapsed = Date.now() - start;
            if (elapsed < MIN_RESPONSE_MS) {
                await new Promise(r => setTimeout(r, MIN_RESPONSE_MS - elapsed + Math.random() * 100));
            }
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

        // pad real path too so both branches take similar time
        const elapsed = Date.now() - start;
        if (elapsed < MIN_RESPONSE_MS) {
            await new Promise(r => setTimeout(r, MIN_RESPONSE_MS - elapsed));
        }
        return resetAckResponse();
    } catch (error) {
        logger.error('password reset request error', { error });
        return createErrorResponse('Failed to send reset email', 500);
    }
}
