// shared auth utilities — JWT, sessions, response formatting

import jwt from 'jsonwebtoken';
import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import sql from '@/database/pgsql.js';

// jwt

function validateJWTSecret() {
    if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET environment variable is not set');
    }
}

export function generateJWTToken(payload, expiresIn = '1d') {
    validateJWTSecret();
    return jwt.sign(payload, process.env.JWT_SECRET, {expiresIn});
}

export function verifyJWTToken(token) {
    validateJWTSecret();
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
        return null;
    }
}

// session cookies

export async function createSessionCookie(token, expiryDays = 1) {
    const expires = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

    (await cookies()).set('session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        expires: expires,
        sameSite: 'lax',
        path: '/'
    });
}

export async function getSessionCookie() {
    const cookieStore = await cookies();
    return cookieStore.get('session')?.value;
}

export async function clearSessionCookie() {
    (await cookies()).delete('session');
}

export async function validateSession() {
    const token = await getSessionCookie();
    if (!token) return null;
    const payload = verifyJWTToken(token);
    if (!payload?.user_id) return null;

    // verify user is still active in the database
    const [user] = await sql`
        SELECT user_id, email FROM app.login
        WHERE user_id = ${payload.user_id}::uuid
          AND is_active = true
          AND deleted_at IS NULL
        LIMIT 1
    `;
    return user ?? null;
}

// response formatting

export function createSuccessResponse(data, status = 200) {
    return NextResponse.json(
        {success: true, ...data},
        {status}
    );
}

export function createErrorResponse(message, status = 400, additionalData = {}) {
    return NextResponse.json(
        {success: false, error: message, ...additionalData},
        {status}
    );
}

export function createValidationErrorResponse(errors) {
    return NextResponse.json(
        {
            success: false,
            error: 'Validation failed',
            validationErrors: errors
        },
        {status: 400}
    );
}

// combined auth helpers

export async function createAuthSession(user, expiryDays = 1) {
    const token = generateJWTToken(
        {user_id: user.user_id, email: user.email},
        `${expiryDays}d`
    );

    await createSessionCookie(token, expiryDays);

    return createSuccessResponse({
        user: {
            user_id: user.user_id,
            email: user.email
        }
    });
}

// request parsing

export async function parseJsonBody(request) {
    const contentType = request.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
        return {
            data: null,
            error: createErrorResponse('Content-Type must be application/json', 415)
        };
    }

    try {
        const data = await request.json();
        return {data, error: null};
    } catch (parseError) {
        return {
            data: null,
            error: createErrorResponse('Invalid JSON in request body', 400)
        };
    }
}
