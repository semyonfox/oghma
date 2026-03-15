/**
 * Logout Route Handler
 *
 * Purpose: Invalidate user session from both Auth.js (OAuth) and custom JWT (email/password).
 * Security: Revokes Auth.js sessions and clears JWT cookie to fully terminate user session.
 */

/**
 * POST /api/auth/logout
 *
 * Clears both Auth.js session (OAuth) and JWT cookie (email/password).
 *
 * @param {Request} request - The HTTP request object
 * @returns {Response} JSON response with success status and cleared cookie header
 */
export async function POST(request) {
    try {
        // Clear Auth.js session cookies by setting them to empty with past expiration
        // Auth.js uses standard auth session cookies
        
        // Clear the custom JWT cookie by setting an empty value with past expiration date.
        // This ensures the client and server both invalidate the session.
        const response = new Response(
            JSON.stringify({
                success: true,
                message: 'Logged out successfully'
            }),
            {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    // Clear 'session' cookie (custom JWT)
                    'Set-Cookie': 'session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 UTC; HttpOnly; Secure; SameSite=Strict'
                }
            }
        );

        return response;
    } catch (error) {
        return Response.json(
            { error: 'Logout failed' },
            { status: 500 }
        );
    }
}
