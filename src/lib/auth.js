/**
 * Shared Authentication Utilities
 * Provides reusable functions for JWT handling, session management, and auth responses
 * Consolidates all the common auth logic in one place
 */

import jwt from 'jsonwebtoken';
import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';


// ============================================================
// JWT UTILITIES
// ============================================================

/**
 * Validates that JWT_SECRET environment variable is set
 * @throws {Error} - If JWT_SECRET is not configured
 */
function validateJWTSecret() {
    if (!process.env.JWT_SECRET) {
        throw new Error(
            'JWT_SECRET environment variable is not set. ' +
            'Please configure a secure JWT secret in your .env.local file.'
        );
    }
}

/**
 * Generates a JWT token for a user
 * @param {Object} payload - Data to encode in the token (e.g., { user_id, email })
 * @param {string} expiresIn - Token expiration time (default: '1d')
 * @returns {string} - JWT token
 */
export function generateJWTToken(payload, expiresIn = '1d') {
    validateJWTSecret();

    return jwt.sign(
        payload,
        process.env.JWT_SECRET,
        {expiresIn}
    );
}

/**
 * Verifies and decodes a JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object|null} - Decoded payload or null if invalid
 */
export function verifyJWTToken(token) {
    try {
        validateJWTSecret();
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
        return null;
    }
}

// ============================================================
// SESSION COOKIE UTILITIES
// ============================================================

/**
 * Creates a session cookie with a JWT token
 * @param {string} token - JWT token to store in cookie
 * @param {number} expiryDays - Number of days until cookie expires (default: 1)
 */
export async function createSessionCookie(token, expiryDays = 1) {
    const expires = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

    (await cookies()).set('session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'development',
        expires: expires,
        sameSite: 'lax',
        path: '/'
    });
}

/**
 * Retrieves the session token from cookies
 * @returns {string|undefined} - Session token or undefined if not found
 */
export async function getSessionCookie() {
    const cookieStore = await cookies();
    return cookieStore.get('session')?.value;
}

/**
 * Removes the session cookie (logout)
 */
export async function clearSessionCookie() {
    (await cookies()).delete('session');
}

/**
 * Validates the current session and returns the user data
 * Useful for middleware and protected route handlers
 * @returns {Object|null} - User data from token or null if invalid
 */
export async function validateSession() {
    const token = await getSessionCookie();
    if (!token) return null;
    return verifyJWTToken(token);
}

// ============================================================
// RESPONSE FORMATTING UTILITIES
// ============================================================

/**
 * Creates a standardized success response
 * @param {Object} data - Data to include in response
 * @param {number} status - HTTP status code (default: 200)
 * @returns {NextResponse} - Formatted success response
 */
export function createSuccessResponse(data, status = 200) {
    return NextResponse.json(
        {success: true, ...data},
        {status}
    );
}

/**
 * Creates a standardized error response
 * @param {string} message - Error message
 * @param {number} status - HTTP status code (default: 400)
 * @param {Object} additionalData - Additional data to include
 * @returns {NextResponse} - Formatted error response
 */
export function createErrorResponse(message, status = 400, additionalData = {}) {
    return NextResponse.json(
        {success: false, error: message, ...additionalData},
        {status}
    );
}

/**
 * Creates a validation error response
 * @param {Object} errors - Object with field names as keys and error messages as values
 * @returns {NextResponse} - Formatted validation error response
 */
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

// ============================================================
// COMBINED AUTH HELPERS
// ============================================================

/**
 * Complete authentication flow: validate, generate token, create session
 * @param {Object} user - User object (must include user_id and email)
 * @param {number} expiryDays - Session expiry in days
 * @returns {Promise<NextResponse>} - Success response with user data
 */
export async function createAuthSession(user, expiryDays = 1) {
    // Generate JWT token
    const token = generateJWTToken(
        {user_id: user.user_id, email: user.email},
        `${expiryDays}d`
    );

    // Create session cookie
    await createSessionCookie(token, expiryDays);

    // Return success response
    return createSuccessResponse({
        user: {
            user_id: user.user_id,
            email: user.email
        }
    });
}

// ============================================================
// REQUEST VALIDATION UTILITIES
// ============================================================

/**
 * Validates and parses JSON request body
 * Checks Content-Type header and parses JSON in one step
 * @param {Request} request - Next.js request object
 * @returns {Promise<{data: any, error: NextResponse|null}>} - Parsed data or error response
 */
export async function parseJsonBody(request) {
    // Validate Content-Type header
    const contentType = request.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
        return {
            data: null,
            error: createErrorResponse('Content-Type must be application/json', 415)
        };
    }

    // Parse JSON body
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