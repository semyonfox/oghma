import { NextRequest, NextResponse } from 'next/server';

// routes that don't require authentication
const PUBLIC_ROUTES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/password-reset',
  '/api/auth/signin',
  '/api/auth/callback',
  '/api/auth/error',
  '/api/health',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/',
];

// routes that require a valid session
const PROTECTED_ROUTES = [
  '/api/notes',
  '/api/tree',
  '/api/settings',
  '/api/auth/logout',
  '/api/auth/me',
  '/notes',
];

/**
 * Verifies a HS256 JWT token using the Web Crypto API (Edge-compatible).
 * Replaces jsonwebtoken which requires Node.js crypto and cannot run in Edge Runtime.
 */
async function verifySessionJWT(token: string): Promise<boolean> {
  const secret = process.env.JWT_SECRET;
  if (!secret || !token) return false;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const [headerB64, payloadB64, signatureB64] = parts;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // base64url → Uint8Array
    const b64ToBytes = (b64url: string) =>
      Uint8Array.from(
        atob(b64url.replace(/-/g, '+').replace(/_/g, '/')),
        (c) => c.charCodeAt(0)
      );

    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      b64ToBytes(signatureB64),
      encoder.encode(`${headerB64}.${payloadB64}`)
    );

    if (!valid) return false;

    // check expiry
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return false;

    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // pass through public routes immediately
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // enforce auth on protected routes
  if (PROTECTED_ROUTES.some((route) => pathname.startsWith(route))) {
    const sessionToken = request.cookies.get('session')?.value;
    const valid = await verifySessionJWT(sessionToken ?? '');

    if (valid) return NextResponse.next();

    // no valid session — reject
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)'],
};
