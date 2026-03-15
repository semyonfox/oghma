/**
 * Current User Profile Route Handler
 *
 * Purpose: Retrieve the authenticated user's profile information.
 * Security: Validates both Auth.js sessions (OAuth) and JWT tokens (email/password).
 * Used by: Frontend to display user info, verify active session, guard protected routes.
 */

import { getServerSession } from 'next-auth';
import { authConfig } from '@/auth.config';
import { validateSession } from '@/lib/auth.js';

/**
 * GET /api/auth/me
 *
 * Returns the current user's profile information from either Auth.js (OAuth) or JWT (email/password).
 *
 * @param {Request} request - The HTTP request object (includes cookies)
 * @returns {Response} User data (user_id, email) or 401 if unauthorized
 */
export async function GET(request) {
    try {
        // Try Auth.js session first (OAuth users)
        const authJsSession = await getServerSession(authConfig);
        if (authJsSession && authJsSession.user) {
            return Response.json({
                success: true,
                user: {
                    user_id: authJsSession.user.id,
                    email: authJsSession.user.email,
                    name: authJsSession.user.name
                }
            });
        }

        // Fall back to custom JWT (email/password users)
        const jwtUser = await validateSession();
        if (jwtUser) {
            return Response.json({
                success: true,
                user: {
                    user_id: jwtUser.user_id,
                    email: jwtUser.email
                }
            });
        }

        // No valid session found
        return Response.json(
            { error: 'Unauthorized' },
            { status: 401 }
        );
    } catch (error) {
        return Response.json(
            { error: 'Invalid token' },
            { status: 401 }
        );
    }
}
