// clears all auth cookies (custom JWT + Auth.js OAuth) to fully terminate the session
export async function POST() {
    try {
        const expired = 'Thu, 01 Jan 1970 00:00:00 UTC'

        // every cookie name that could hold session state
        const cookieNames = [
            'session',                            // custom JWT (email/password)
            'next-auth.session-token',            // Auth.js session (dev)
            'next-auth.csrf-token',               // Auth.js CSRF (dev)
            'next-auth.callback-url',             // Auth.js callback (dev)
            '__Secure-next-auth.session-token',   // Auth.js session (prod/HTTPS)
            '__Secure-next-auth.csrf-token',      // Auth.js CSRF (prod/HTTPS)
            '__Secure-next-auth.callback-url',    // Auth.js callback (prod/HTTPS)
        ]

        const headers = new Headers({ 'Content-Type': 'application/json' })
        for (const name of cookieNames) {
            // clear with both secure and non-secure variants to cover all environments
            headers.append('Set-Cookie', `${name}=; Path=/; Expires=${expired}; HttpOnly; SameSite=Lax`)
            headers.append('Set-Cookie', `${name}=; Path=/; Expires=${expired}; HttpOnly; Secure; SameSite=Lax`)
        }

        return new Response(
            JSON.stringify({ success: true, message: 'Logged out successfully' }),
            { status: 200, headers }
        )
    } catch (error) {
        return Response.json({ error: 'Logout failed' }, { status: 500 })
    }
}
