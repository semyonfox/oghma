import { NextRequest, NextResponse } from "next/server";
import logger from "./logger";
import { getTraceId, withTrace } from "./trace";
import { validateSession } from "./auth";
import { isValidUUID } from "./utils/uuid";

// ── Error classes ────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public userMessage: string,
    public internalDetails?: string,
  ) {
    super(userMessage);
    this.name = "ApiError";
  }
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function getAllowedOrigins(request: Request): Set<string> {
  const origins = new Set<string>([new URL(request.url).origin]);

  for (const value of [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXTAUTH_URL,
    process.env.APP_BASE_URL,
  ]) {
    const origin = normalizeOrigin(value);
    if (origin) origins.add(origin);
  }

  for (const value of (process.env.CORS_ORIGINS ?? "").split(",")) {
    const origin = normalizeOrigin(value.trim());
    if (origin) origins.add(origin);
  }

  return origins;
}

export function assertTrustedOrigin(request: Request | NextRequest): void {
  if (process.env.NODE_ENV === "test") return;
  if (SAFE_METHODS.has(request.method.toUpperCase())) return;

  const candidate =
    normalizeOrigin(request.headers.get("origin")) ??
    normalizeOrigin(request.headers.get("referer"));

  if (!candidate) {
    throw new ApiError(403, "Invalid request origin", "Missing Origin/Referer");
  }

  if (!getAllowedOrigins(request).has(candidate)) {
    throw new ApiError(
      403,
      "Invalid request origin",
      `Origin ${candidate} not allowed`,
    );
  }
}

// ── Error response helpers ───────────────────────────────────────────────────

function extractErrorInfo(error: unknown) {
  if (error instanceof ApiError) {
    return {
      userMessage: error.userMessage,
      statusCode: error.statusCode,
      logMeta: {
        statusCode: error.statusCode,
        internal: error.internalDetails,
      },
    };
  }
  const raw = error instanceof Error ? error.message : String(error);
  return {
    userMessage: "Internal server error",
    statusCode: 500,
    logMeta: { message: raw, stack: (error as Error)?.stack },
  };
}

export function apiErrorResponse(error: unknown): NextResponse {
  const { userMessage, statusCode, logMeta } = extractErrorInfo(error);
  logger.error(userMessage, logMeta);
  return NextResponse.json(
    { error: userMessage, traceId: getTraceId() },
    { status: statusCode },
  );
}

// traced error response for manual returns within a withErrorHandler route
export function tracedError(message: string, status: number): NextResponse {
  return NextResponse.json(
    { error: message, traceId: getTraceId() },
    { status },
  );
}

// ── Route wrapper ────────────────────────────────────────────────────────────

type RouteHandler = (
  request: NextRequest,
  context?: any,
) => Promise<NextResponse>;

export function withErrorHandler(handler: RouteHandler): RouteHandler {
  return (request, context) =>
    withTrace(async () => {
      try {
        assertTrustedOrigin(request);
        return await handler(request, context);
      } catch (error) {
        return apiErrorResponse(error);
      }
    });
}

// ── Auth + validation shortcuts ──────────────────────────────────────────────

interface AuthUser {
  user_id: string;
  email: string;
}

/**
 * Validate the session and return the user, or throw an ApiError(401).
 * Use inside a `withErrorHandler` wrapper so the error is caught automatically.
 */
export async function requireAuth(): Promise<AuthUser> {
  const user = await validateSession();
  if (!user) throw new ApiError(401, "Unauthorized");
  return user as AuthUser;
}

/**
 * Validate that a string is a valid UUID, or throw an ApiError(400).
 * Returns the validated string for inline use.
 */
export function requireValidId(value: unknown, fieldName = "ID"): string {
  if (!isValidUUID(value)) {
    throw new ApiError(400, `Invalid ${fieldName}`);
  }
  return value;
}
