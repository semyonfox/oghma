import sql from '@/database/pgsql.js';
import { createErrorResponse, parseJsonBody } from '@/lib/auth.js';
import { generateSecureToken, hashToken } from '@/lib/tokens.js';
import { sendVerificationEmail } from '@/lib/email.js';
import { checkRateLimit } from '@/lib/rateLimiter';
import logger from '@/lib/logger';

function ackResponse() {
    return new Response(
        JSON.stringify({ message: 'If that email needs verification, we sent a new link.' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
}

export async function POST(request) {
    try {
        const { data: body, error: parseError } = await parseJsonBody(request);
        if (parseError) return parseError;

        const { email } = body;
        if (!email) return createErrorResponse('Email is required', 400);

        const limited = await checkRateLimit('resend-verification', email.trim().toLowerCase());
        if (limited) return limited;

        const users = await sql`
            SELECT user_id, email, email_verified
            FROM app.login
            WHERE email = ${email.trim()}
        `;

        // constant-time: same work whether email exists or not
        const start = Date.now();
        const MIN_RESPONSE_MS = 500;

        if (users.length === 0 || users[0].email_verified === true) {
            // burn equivalent CPU time
            hashToken(generateSecureToken());
            const elapsed = Date.now() - start;
            if (elapsed < MIN_RESPONSE_MS) {
                await new Promise(r => setTimeout(r, MIN_RESPONSE_MS - elapsed + Math.random() * 100));
            }
            return ackResponse();
        }

        const user = users[0];
        const verificationToken = generateSecureToken();
        const tokenHash = hashToken(verificationToken);
        const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        await sql`
            UPDATE app.login
            SET verification_token = ${tokenHash}, verification_token_expires = ${tokenExpires}
            WHERE user_id = ${user.user_id}
        `;

        await sendVerificationEmail(email.trim(), verificationToken);

        const elapsed = Date.now() - start;
        if (elapsed < MIN_RESPONSE_MS) {
            await new Promise(r => setTimeout(r, MIN_RESPONSE_MS - elapsed));
        }
        return ackResponse();
    } catch (error) {
        logger.error('resend verification error', { error });
        return createErrorResponse('Failed to resend verification email', 500);
    }
}
