/**
 * Current User Profile Route Handler
 *
 * Purpose: Retrieve the authenticated user's profile information.
 * Security: Validates JWT token from session cookie; returns 401 if invalid/missing.
 * Used by: Frontend to display user info, verify active session, guard protected routes.
 */

import { validateSession } from '@/lib/auth.js';

/**
 * GET /api/auth/me
 *
 * Returns the current user's profile information if a valid session exists.
 *
 * @param {Request} request - The HTTP request object (includes cookies)
 * @returns {Response} User data (user_id, email) or 401 if unauthorized
 */
export async function GET(request) {
    try {
        // Validate session and retrieve user data from JWT token
        const user = await validateSession();

        if (!user) {
            return Response.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Return authenticated user's profile
        return Response.json({
            success: true,
            user: {
                user_id: user.user_id,
                email: user.email
            }
        });
    } catch (error) {
        return Response.json(
            { error: 'Invalid token' },
            { status: 401 }
        );
    }
}
