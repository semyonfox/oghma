// shared auth utilities — JWT, sessions, response formatting

import { readBoundedBody, BodyTooLargeError } from "@/lib/http/bounded-body";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import sql from "@/database/pgsql";
import { auth } from "@/auth";
import { ApiError } from "@/lib/api-errors";
import { generateTraceId, getTraceId } from "@/lib/trace";

export interface SessionUser {
  user_id: string;
  email: string;
  session_version: number;
}

export type JWTPayload = Record<string, unknown>;
type JsonObject = Record<string, unknown>;
function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// jwt

function requireJWTSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return secret;
}

export function generateJWTToken(
  payload: JWTPayload,
  expiresIn: string = "1d",
): string {
  return jwt.sign(payload, requireJWTSecret(), {
    expiresIn,
  } as jwt.SignOptions);
}

export function verifyJWTToken(token: string): JWTPayload | null {
  const secret = requireJWTSecret();
  try {
    const decoded = jwt.verify(token, secret);
    return typeof decoded === "string" ? null : (decoded as JWTPayload);
  } catch (_error) {
    return null;
  }
}

// session cookies

export async function createSessionCookie(
  token: string,
  expiryDays: number = 1,
): Promise<void> {
  const expires = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

  (await cookies()).set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    expires: expires,
    sameSite: "strict",
    path: "/",
  });
}

export async function getSessionCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get("session")?.value;
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete("session");
}

// presence uses the same revocation and account checks as other endpoints
export async function validateSessionLite(): Promise<{
  user_id: string;
} | null> {
  const user = await validateSession();
  return user ? { user_id: user.user_id } : null;
}

export async function validateSession(
  _request?: unknown,
): Promise<SessionUser | null> {
  const token = await getSessionCookie();
  if (token) {
    const payload = verifyJWTToken(token);
    if (
      typeof payload?.user_id === "string" &&
      Number.isSafeInteger(payload.session_version)
    ) {
      const [user] = await sql<SessionUser[]>`
        SELECT user_id, email, session_version FROM app.login
        WHERE user_id = ${payload.user_id}::uuid
          AND session_version = ${Number(payload.session_version)}
          AND email_verified = true
          AND is_active = true AND deleted_at IS NULL
        LIMIT 1
      `;
      if (user) return user;
    }
  }

  const session = await auth();
  if (session?.validationUnavailable)
    throw new ApiError(503, "Unable to verify session");
  if (session?.user?.id && Number.isSafeInteger(session.user.sessionVersion)) {
    const [user] = await sql<SessionUser[]>`
      SELECT user_id, email, session_version FROM app.login
      WHERE user_id = ${session.user.id}::uuid
        AND session_version = ${Number(session.user.sessionVersion)}
        AND email_verified = true
        AND is_active = true AND deleted_at IS NULL
      LIMIT 1
    `;
    if (user) return user;
  }
  return null;
}

/**
 * Return the authenticated account identifier for routes that do not need the
 * rest of the session record. The lookup still verifies that the account is
 * active and has not been deleted.
 */
export async function getAuthenticatedUserId(): Promise<string | null> {
  return (await validateSession())?.user_id ?? null;
}

// response formatting

function responseTraceId(): string {
  const traceId = getTraceId();
  return traceId === "no-trace" ? generateTraceId() : traceId;
}

export function createSuccessResponse(
  data: Record<string, unknown>,
  status: number = 200,
): NextResponse {
  return NextResponse.json({ success: true, ...data }, { status });
}

export function createErrorResponse(
  message: string,
  status: number = 400,
  additionalData: Record<string, unknown> = {},
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: message,
      ...additionalData,
      traceId: responseTraceId(),
    },
    { status },
  );
}

export function createValidationErrorResponse(errors: unknown): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: "Validation failed",
      details: errors,
      validationErrors: errors,
      traceId: responseTraceId(),
    },
    { status: 400 },
  );
}

// combined auth helpers

export async function createAuthSession(
  user: SessionUser,
  expiryDays: number = 1,
): Promise<NextResponse> {
  if (!Number.isSafeInteger(user.session_version)) {
    throw new Error("Session version is required");
  }
  const token = generateJWTToken(
    {
      user_id: user.user_id,
      email: user.email,
      session_version: user.session_version,
    },
    `${expiryDays}d`,
  );

  await createSessionCookie(token, expiryDays);

  return createSuccessResponse({
    user: {
      user_id: user.user_id,
      email: user.email,
    },
  });
}

// request parsing

export async function parseJsonBody(
  request: Request,
): Promise<{ data: JsonObject | null; error: NextResponse | null }> {
  const contentType = request.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    return {
      data: null,
      error: createErrorResponse("Content-Type must be application/json", 415),
    };
  }

  try {
    const value: unknown = JSON.parse(
      new TextDecoder().decode(await readBoundedBody(request, 64 * 1024)),
    );
    return {
      data: isJsonObject(value) ? value : null,
      error: null,
    };
  } catch (_parseError) {
    if (_parseError instanceof BodyTooLargeError)
      return {
        data: null,
        error: createErrorResponse("Request body too large", 413),
      };
    return {
      data: null,
      error: createErrorResponse("Invalid JSON in request body", 400),
    };
  }
}
