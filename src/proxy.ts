import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((o: string) => o.trim());

if (process.env.NEXT_PUBLIC_APP_URL) {
    ALLOWED_ORIGINS.push(process.env.NEXT_PUBLIC_APP_URL);
}

const CORS_HEADERS = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
};

// custom JWT, Auth.js v5 session, and the numbered chunks Auth.js uses for large tokens
const SESSION_COOKIE = /^(?:session|(?:__Secure-)?authjs\.session-token(?:\.\d+)?)$/;

const MARKDOWN_REWRITES = new Map([
    ["/ai", "/ai.md"],
    ["/info", "/info.md"],
    ["/pricing", "/pricing.md"],
]);

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

    const markdownTarget = MARKDOWN_REWRITES.get(pathname);
    if (markdownTarget) {
        const response = wantsMarkdown(request)
            ? NextResponse.rewrite(new URL(markdownTarget, request.url))
            : NextResponse.next();
        Object.entries(corsHeaders).forEach(([key, value]) => response.headers.set(key, value));
        response.headers.set("Vary", "Accept");
        return response;
    }

    // presence only: the edge proxy can't reach the DB, so revocation is enforced by
    // validateSession in every API route. login must stay reachable with a revoked cookie
    const isAuthenticated = request.cookies
        .getAll()
        .some((cookie) => SESSION_COOKIE.test(cookie.name) && cookie.value);

    // redirect unauthenticated users to login for protected routes
    // (skip auth pages to avoid redirect loops)
    const isAuthPage = pathname === "/login" || pathname === "/register";
    if (!isAuthenticated && !isAuthPage) {
        // fetch callers expect the same 401 JSON the routes return, not a login page
        const response = pathname.startsWith("/api/")
            ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
            : NextResponse.redirect(new URL("/login", request.url));
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
