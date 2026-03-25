import { NextRequest, NextResponse } from 'next/server';

// Allow CORS for configured origins
// In production, set CORS_ORIGINS env var to comma-separated list
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map((o: string) => o.trim());

// Always include app URL in production
if (process.env.NEXT_PUBLIC_APP_URL) {
  ALLOWED_ORIGINS.push(process.env.NEXT_PUBLIC_APP_URL);
}

const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true',
};

function getCORSHeaders(request: NextRequest) {
  const origin = request.headers.get('origin') || '';
  const isAllowed = ALLOWED_ORIGINS.includes(origin);
  const allowedOrigin = isAllowed ? origin : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    ...CORS_HEADERS,
  };
}

export async function proxy(request: NextRequest) {
    const session = request.cookies.get('session')?.value;
    const corsHeaders = getCORSHeaders(request);

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
        return new NextResponse(null, { status: 204, headers: corsHeaders });
    }

    // Check session for protected routes
    if (!session) {
        const response = NextResponse.redirect(new URL('/login', request.url));
        Object.entries(corsHeaders).forEach(([key, value]) => {
            response.headers.set(key, value);
        });
        return response;
    }

    // Allow request with CORS headers
    const response = NextResponse.next();
    Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
    });
    return response;
}

export const config = {
    matcher: [
        '/dashboard/:path*',
        '/api/extract/:path*',
        '/notes/:path*',
        '/upload/:path*',
        '/settings/:path*',
        '/trash/:path*',
        '/api/notes/:path*',
        '/api/import-export/:path*',
        '/api/tree/:path*',
        '/api/trash/:path*',
        '/api/upload/:path*',
        '/api/settings/:path*',
    ]
};
