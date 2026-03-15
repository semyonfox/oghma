import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { validateSession } from '@/lib/auth';

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

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // pass through public routes immediately
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // enforce auth on protected routes
  if (PROTECTED_ROUTES.some(route => pathname.startsWith(route))) {
    // check next-auth OAuth session via JWT (Edge-safe — uses jose only, no bcryptjs/postgres)
    const nextAuthToken = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
    });
    if (nextAuthToken) {
      return NextResponse.next();
    }

    // check custom JWT session (email/password users via /api/auth/login)
    const jwtUser = await validateSession();
    if (jwtUser) {
      return NextResponse.next();
    }

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
