import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_ORIGINS = [
  'https://oghmanotes.semyon.ie',
  'https://www.oghmanotes.semyon.ie',
  'http://localhost:3000',
];

function getCORSHeaders(request: NextRequest) {
  const origin = request.headers.get('origin') || 'https://oghmanotes.semyon.ie';
  const isAllowed = ALLOWED_ORIGINS.includes(origin);
  const corsOrigin = isAllowed ? origin : 'https://oghmanotes.semyon.ie';

  return {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}

export async function proxy(request: NextRequest) {
    const session = request.cookies.get('session')?.value;
    const corsHeaders = getCORSHeaders(request);

    // Handle OPTIONS requests (preflight)
    if (request.method === 'OPTIONS') {
        return new NextResponse(null, { status: 200, headers: corsHeaders });
    }

    if (!session) {
        const response = NextResponse.redirect(new URL('/login', request.url));
        Object.entries(corsHeaders).forEach(([key, value]) => {
            response.headers.set(key, value);
        });
        return response;
    }

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
        '/api/extract/:path*',
        '/api/notes/:path*',
        '/api/import-export/:path*',
        '/api/tree/:path*',
        '/api/trash/:path*',
        '/api/upload/:path*',
        '/api/settings/:path*',
    ]
};
