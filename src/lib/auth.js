/**
 * Shared Authentication Utilities
 * Provides reusable functions for validation, JWT handling, and session management
 * Consolidates all the common auth logic in one place
 */

import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// ============================================================
// VALIDATION UTILITIES
// ============================================================

/**
 * Validates email format using regex
 * @param {string} email - Email address to validate
 * @returns {boolean} - True if email is valid
 */
export function validateEmail(email) {
    if (!email || typeof email !== 'string') {
        return false;
    }

    // RFC 5322 simplified email regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
}

/**
 * Validates password strength
 * @param {string} password - Password to validate
 * @returns {{ isValid: boolean, errors: string[] }} - Validation result with specific errors
 */
export function validatePassword(password) {
    const errors = [];

    if (!password || typeof password !== 'string') {
        errors.push('Password is required');
        return { isValid: false, errors };
    }

    if (password.length < 8) {
        errors.push('Password must be at least 8 characters long');
    }

    if (!/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }

    if (!/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    }

    if (!/[0-9]/.test(password)) {
        errors.push('Password must contain at least one number');
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Validates required fields are present and not empty
 * @param {Object} fields - Object with field names as keys and values to validate
 * @returns {{ isValid: boolean, missingFields: string[] }} - Validation result
 */
export function validateRequiredFields(fields) {
    const missingFields = [];

    for (const [fieldName, fieldValue] of Object.entries(fields)) {
        if (fieldValue == null || fieldValue === '' || (typeof fieldValue === 'string' && fieldValue.trim() === '')) {
            missingFields.push(fieldName);
        }
    }

    return {
        isValid: missingFields.length === 0,
        missingFields
    };
}

/**
 * Validates authentication credentials (email and password)
 * @param {string} email - Email to validate
 * @param {string} password - Password to validate
 * @param {boolean} checkPasswordStrength - Whether to check password strength (true for registration)
 * @returns {{ isValid: boolean, errors: Object }} - Validation result with specific errors
 */
export function validateAuthCredentials(email, password, checkPasswordStrength = false) {
    const errors = {};

    // Validate required fields
    const requiredValidation = validateRequiredFields({ email, password });
    if (!requiredValidation.isValid) {
        requiredValidation.missingFields.forEach(field => {
            errors[field] = `${field.charAt(0).toUpperCase() + field.slice(1)} is required`;
        });
    }

    // Validate email format
    if (email && !validateEmail(email)) {
        errors.email = 'Invalid email format';
    }

    // Validate password strength (for registration)
    if (checkPasswordStrength && password) {
        const passwordValidation = validatePassword(password);
        if (!passwordValidation.isValid) {
            errors.password = passwordValidation.errors.join('; ');
        }
    }

    return {
        isValid: Object.keys(errors).length === 0,
        errors
    };
}

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
        { expiresIn }
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
        secure: process.env.NODE_ENV === 'production',
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
 * @returns {Object|null} - User data from token or null if invalid
 */
export async function validateSession() {
    const token = await getSessionCookie();
    if (!token) {
        return null;
    }

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
        { success: true, ...data },
        { status }
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
        { error: message, ...additionalData },
        { status }
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
            error: 'Validation failed',
            validationErrors: errors
        },
        { status: 400 }
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
        { user_id: user.user_id, email: user.email },
        `${expiryDays}d`
    );

    // Create session cookie
    await createSessionCookie(token, expiryDays);

    // Return success response
    return createSuccessResponse(
        {
            user: {
                user_id: user.user_id,
                email: user.email
            }
        },
        200
    );
}

