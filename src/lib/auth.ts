// shared auth utilities — JWT, sessions, response formatting

import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import sql from "@/database/pgsql.js";
import { auth } from "@/auth";

export interface SessionUser {
  user_id: string;
  email: string;
}

export type JWTPayload = Record<string, unknown>;

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

export async function validateSession(
  _request?: unknown,
): Promise<SessionUser | null> {
  // 1. try Sam's custom session cookie (email/password login)
  const token = await getSessionCookie();
  if (token) {
    const payload = verifyJWTToken(token);
    if (typeof payload?.user_id === "string") {
      const [user] = await sql`
                SELECT user_id, email FROM app.login
                WHERE user_id = ${payload.user_id}::uuid
                  AND is_active = true
                  AND deleted_at IS NULL
                LIMIT 1
            `;
      if (user) return user as SessionUser;
    }
  }

  // 2. try NextAuth v5 session (OAuth login)
  try {
    const session = await auth();
    if (session?.user?.id) {
      const [user] = await sql`
                  SELECT user_id, email FROM app.login
                  WHERE user_id = ${session.user.id}::uuid
                    AND is_active = true
                    AND deleted_at IS NULL
                  LIMIT 1
              `;
      if (user) return user as SessionUser;
    }
  } catch {
    // NextAuth session invalid or expired — fall through
  }

  return null;
}

// response formatting

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
    { success: false, error: message, ...additionalData },
    { status },
  );
}

export function createValidationErrorResponse(errors: unknown[]): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: "Validation failed",
      validationErrors: errors,
    },
    { status: 400 },
  );
}

// combined auth helpers

export async function createAuthSession(
  user: SessionUser,
  expiryDays: number = 1,
): Promise<NextResponse> {
  const token = generateJWTToken(
    { user_id: user.user_id, email: user.email },
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
): Promise<{ data: any; error: NextResponse | null }> {
  const contentType = request.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    return {
      data: null,
      error: createErrorResponse("Content-Type must be application/json", 415),
    };
  }

  try {
    const data = await request.json();
    return { data, error: null };
  } catch (_parseError) {
    return {
      data: null,
      error: createErrorResponse("Invalid JSON in request body", 400),
    };
  }
}
