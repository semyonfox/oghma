/**
 * Logout Route Handler
 *
 * Purpose: Invalidate user session by clearing authentication cookie.
 * Security: Clients trust HTTP-only cookie invalidation; JWT in cookie becomes unusable
 * on server-side validation once cleared.
 */

/**
 * POST /api/auth/logout
 *
 * Clears the session cookie to terminate the user session.
 *
 * @param {Request} request - The HTTP request object
 * @returns {Response} JSON response with success status and cleared cookie header
 */
export async function POST(request) {
    try {
        // Clear the session cookie by setting an empty value with past expiration date.
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
                    // Clear 'session' cookie (matches createSessionCookie in auth.js)
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
