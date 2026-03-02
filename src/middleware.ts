import { NextRequest, NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
    const session = request.cookies.get('session')?.value;

    if (!session) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    return NextResponse.next();
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