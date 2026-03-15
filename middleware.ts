import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authConfig } from '@/auth.config';
import { validateSession } from '@/lib/auth';

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

  // Skip public routes
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Protect all protected routes
  if (PROTECTED_ROUTES.some(route => pathname.startsWith(route))) {
    // Try Auth.js session first (OAuth users)
    try {
      const authJsSession = await getServerSession(authConfig);
      if (authJsSession && (authJsSession as any).user) {
        return NextResponse.next();
      }
    } catch (error) {
      // Auth.js session check failed, continue to JWT fallback
    }

    // Fall back to custom JWT (email/password users)
    const jwtUser = await validateSession();
    if (jwtUser) {
      return NextResponse.next();
    }

    // No valid session - reject request
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Redirect to login for page routes
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)'],
};
