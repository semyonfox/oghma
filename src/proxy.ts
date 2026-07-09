import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || "http://localhost:3000").split(",").map((o: string) => o.trim());

if (process.env.NEXT_PUBLIC_APP_URL) {
    ALLOWED_ORIGINS.push(process.env.NEXT_PUBLIC_APP_URL);
}

const CORS_HEADERS = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
};

function wantsMarkdown(request: NextRequest) {
    const format = request.nextUrl.searchParams.get("format")?.toLowerCase();
    if (format === "md" || format === "markdown") return true;

    const accept = request.headers.get("accept")?.toLowerCase() || "";
    if (!accept) return false;
    if (accept.includes("text/markdown") || accept.includes("text/x-markdown")) return true;
    if (accept.includes("application/markdown")) return true;
    return accept.includes("text/plain") && !accept.includes("text/html");
}

function getCORSHeaders(request: NextRequest) {
    const origin = request.headers.get("origin") || "";
    const isAllowed = ALLOWED_ORIGINS.includes(origin);
    const allowedOrigin = isAllowed ? origin : ALLOWED_ORIGINS[0];
    return { "Access-Control-Allow-Origin": allowedOrigin, ...CORS_HEADERS };
}

export async function proxy(request: NextRequest) {
    const corsHeaders = getCORSHeaders(request);
    const { pathname } = request.nextUrl;

    if (request.method === "OPTIONS") {
        return new NextResponse(null, { status: 204, headers: corsHeaders });
    }

    const markdownRouteMap: Record<string, string> = {
        "/ai": "/ai.md",
        "/info": "/info.md",
        "/pricing": "/pricing.md",
    };
    const markdownTarget = markdownRouteMap[pathname];
    if (markdownTarget) {
        const response = wantsMarkdown(request)
            ? NextResponse.rewrite(new URL(markdownTarget, request.url))
            : NextResponse.next();
        Object.entries(corsHeaders).forEach(([key, value]) => response.headers.set(key, value));
        response.headers.set("Vary", "Accept");
        return response;
    }

    const session = request.cookies.get("session")?.value;
    // Auth.js v5 uses "authjs." prefix (not "next-auth." which was v4)
    const nextAuthSession = request.cookies.get("authjs.session-token")?.value
        || request.cookies.get("__Secure-authjs.session-token")?.value;
    const isAuthenticated = !!(session || nextAuthSession);

    // redirect authenticated users away from login/register (skip the page load)
    if (isAuthenticated && (pathname === "/login" || pathname === "/register")) {
        const response = NextResponse.redirect(new URL("/notes", request.url));
        Object.entries(corsHeaders).forEach(([key, value]) => response.headers.set(key, value));
        return response;
    }

    // redirect unauthenticated users to login for protected routes
    // (skip auth pages to avoid redirect loops)
    const isAuthPage = pathname === "/login" || pathname === "/register";
    if (!isAuthenticated && !isAuthPage) {
        const response = NextResponse.redirect(new URL("/login", request.url));
        Object.entries(corsHeaders).forEach(([key, value]) => response.headers.set(key, value));
        return response;
    }

    const response = NextResponse.next();
    Object.entries(corsHeaders).forEach(([key, value]) => response.headers.set(key, value));
    return response;
}

export const config = {
    matcher: [
        "/login",
        "/register",
        "/ai",
        "/info",
        "/pricing",
        "/dashboard/:path*",
        "/notes/:path*",
        "/upload/:path*",
        "/settings/:path*",
        "/trash/:path*",
        "/chat/:path*",
        "/api/extract/:path*",
        "/api/notes/:path*",
        "/api/chat/:path*",
        "/api/import-export/:path*",
        "/api/tree/:path*",
        "/api/trash/:path*",
        "/api/upload/:path*",
        "/api/settings/:path*",
    ],
};
