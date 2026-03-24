import NextAuth from 'next-auth';
import { authConfig } from '@/auth.config';
import type { NextRequest } from 'next/server';

// derive NEXTAUTH_URL from the incoming request so OAuth callbacks
// return to whichever domain the user is actually on
function withDynamicOrigin(req: NextRequest) {
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    const proto = req.headers.get('x-forwarded-proto') || (host?.includes('localhost') ? 'http' : 'https');

    if (host) {
        process.env.NEXTAUTH_URL = `${proto}://${host}`;
    }

    return NextAuth(authConfig)(req as any, undefined as any);
}

export { withDynamicOrigin as GET, withDynamicOrigin as POST };
