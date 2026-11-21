import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Auth } from "@auth/core";
import { encode } from "next-auth/jwt";
import { NextRequest } from "next/server";
import { GET as me } from "@/app/api/auth/me/route";
import { authConfig } from "@/auth.config";
import sql from "@/database/pgsql";

const { authMock, cookiesMock } = vi.hoisted(() => ({
  authMock: vi.fn().mockResolvedValue(null),
  cookiesMock: vi.fn(),
}));
vi.mock("@/database/pgsql", () => ({ default: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/headers", () => ({ cookies: cookiesMock }));
vi.mock("@/lib/i18n/server", () => ({ getRequestLocale: vi.fn() }));

import {
  generateJWTToken,
  verifyJWTToken,
  validateSession,
  validateSessionLite,
  createAuthSession,
  createErrorResponse,
  createValidationErrorResponse,
} from "@/lib/auth/session";

// JWT_SECRET is set in setup.ts

describe("auth error responses", () => {
  it("uses the canonical traced error envelope", async () => {
    const response = createErrorResponse("Unauthorized", 401, { reason: "expired" });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: "Unauthorized",
      reason: "expired",
      traceId: expect.any(String),
    });
  });

  it("keeps validationErrors as a compatibility alias for details", async () => {
    const errors = [{ field: "email", message: "Invalid" }];
    const response = createValidationErrorResponse(errors);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: "Validation failed",
      details: errors,
      validationErrors: errors,
      traceId: expect.any(String),
    });
  });
});

describe("generateJWTToken", () => {
  it("throws if JWT_SECRET is not set", () => {
    const original = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    expect(() => generateJWTToken({ user_id: "abc" })).toThrow("JWT_SECRET");
    process.env.JWT_SECRET = original;
  });
});

describe("verifyJWTToken", () => {
  it("rejects a token signed with the session secret for another audience", async () => {
    const { default: jwt } = await import("jsonwebtoken");
    const foreign = jwt.sign({ user_id: "abc", session_version: 0 }, process.env.JWT_SECRET!, { audience: "something-else", issuer: "oghmanotes" });
    expect(verifyJWTToken(foreign)).toBeNull();
    expect(verifyJWTToken(generateJWTToken({ user_id: "abc", session_version: 0 }))).toMatchObject({ aud: "oghma-session", iss: "oghmanotes" });
  });

  it("accepts a token from before aud and iss only until the transition ends", async () => {
    const { default: jwt } = await import("jsonwebtoken");
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-11-20T00:00:00Z"));
      const legacy = jwt.sign({ user_id: "abc", session_version: 0 }, process.env.JWT_SECRET!, { expiresIn: "120d" });
      expect(verifyJWTToken(legacy)).toMatchObject({ user_id: "abc" });
      vi.setSystemTime(new Date("2027-02-01T00:00:00Z"));
      expect(verifyJWTToken(legacy)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns payload for a valid token", () => {
    const payload = { user_id: "user-123", email: "test@example.com" };
    const token = generateJWTToken(payload);
    const result = verifyJWTToken(token);
    expect(result).not.toBeNull();
    if (!result) throw new Error("Expected a valid token payload");
    expect(result.user_id).toBe("user-123");
    expect(result.email).toBe("test@example.com");
  });

  it("returns null for a completely invalid string", () => {
    expect(verifyJWTToken("not.a.token")).toBeNull();
  });

  it("returns null for expired token", async () => {
    // sign with -1s expiry (already expired)
    const token = generateJWTToken({ user_id: "abc" }, "-1s");
    expect(verifyJWTToken(token)).toBeNull();
  });

  it("throws if JWT_SECRET is missing at verify time", () => {
    const token = generateJWTToken({ user_id: "abc" });
    const original = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    expect(() => verifyJWTToken(token)).toThrow();
    process.env.JWT_SECRET = original;
  });
});

describe("createAuthSession", () => {
  it("sets a lax cookie so links opened from other sites keep the signed-in state", async () => {
    const set = vi.fn();
    cookiesMock.mockResolvedValue({ get: () => undefined, getAll: () => [], set });

    await createAuthSession(
      { user_id: "user-123", email: "synthetic@example.test", session_version: 0 },
      1,
    );

    expect(set).toHaveBeenCalledWith(
      "session",
      expect.any(String),
      expect.objectContaining({ sameSite: "lax", httpOnly: true, path: "/" }),
    );
  });
});

describe("validateSessionLite", () => {
  beforeEach(() => {
    vi.mocked(sql).mockReset().mockResolvedValue([
      { user_id: "user-123", email: "synthetic@example.test", session_version: 0 },
    ]);
    authMock.mockResolvedValue(null);
    cookiesMock.mockResolvedValue({ get: () => undefined, getAll: () => [] });
  });

  it("rejects a tampered session cookie", async () => {
    const token = generateJWTToken({ user_id: "user-123", session_version: 0 });
    cookiesMock.mockResolvedValue({
      getAll: () => [],
      get: () => ({ name: "session", value: token.slice(0, -3) + "xxx" }),
    });

    await expect(validateSessionLite()).resolves.toBeNull();
  });

  it("falls back to the NextAuth session for OAuth users", async () => {
    authMock.mockResolvedValue({ user: { id: "user-123", sessionVersion: 0 } });

    await expect(validateSessionLite()).resolves.toEqual({
      user_id: "user-123",
    });
  });

  it("returns null when no credential is present", async () => {
    await expect(validateSessionLite()).resolves.toBeNull();
  });
});

const userId = "00000000-0000-4000-8000-000000000001";
const account = {
  user_id: userId,
  email: "synthetic@example.test",
  session_version: 2,
};

function cookie(epoch?: number) {
  const token = generateJWTToken({
    user_id: userId,
    ...(epoch !== undefined && { session_version: epoch }),
  });
  cookiesMock.mockResolvedValue({
    get: () => ({ name: "session", value: token }),
    getAll: () => [{ name: "session", value: token }],
  });
}

describe("session revocation and identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookiesMock.mockResolvedValue({ get: () => undefined, getAll: () => [] });
    authMock.mockResolvedValue(null);
    vi.mocked(sql).mockImplementation(async (query, ...params) => {
      const text = Array.isArray(query) ? query.join("") : "";
      expect(text).toContain("email_verified = true");
      expect(text).toContain("is_active = true");
      expect(text).toContain("deleted_at IS NULL");
      return params.includes(2) ? [account] : [];
    });
  });

  afterEach(() => {
    vi.mocked(sql).mockReset();
  });

  it("returns 503 without expiring cookies when the real Auth.js session action masks a callback outage", async () => {
    const secret = "synthetic-auth-session-fixture-secret";
    const token = await encode({
      secret,
      salt: "authjs.session-token",
      token: { user_id: userId, email: account.email, sessionVersion: 2 },
    });
    const cookie = { name: "authjs.session-token", value: token };
    cookiesMock.mockResolvedValue({
      get: () => undefined,
      getAll: () => [cookie],
    });
    vi.mocked(sql).mockRejectedValue(new Error("synthetic database outage"));
    authMock.mockImplementationOnce(async () => {
      const result = await Auth(
        new Request("https://example.test/api/auth/session", {
          headers: { Cookie: `${cookie.name}=${cookie.value}` },
        }),
        {
          ...authConfig,
          basePath: "/api/auth",
          secret,
          trustHost: true,
          useSecureCookies: false,
          logger: { error: vi.fn() },
        },
      );
      const value: unknown = await result.json();
      expect(value).toMatchObject({ validationUnavailable: true });
      return value;
    });
    const result = await me(
      new NextRequest("https://example.test/api/auth/me", {
        headers: { Cookie: `${cookie.name}=${cookie.value}` },
      }),
    );
    expect(result.status).toBe(503);
    expect(result.headers.get("set-cookie")).toBeNull();
  });
  it("rejects unavailable validation before account reads and still rejects invalid sessions", async () => {
    authMock.mockResolvedValue({
      validationUnavailable: true,
      user: { id: userId, sessionVersion: 2 },
      expires: "",
    });
    await expect(validateSession()).rejects.toMatchObject({ statusCode: 503 });
    expect(sql).not.toHaveBeenCalled();
    authMock.mockResolvedValue(null);
    await expect(validateSession()).resolves.toBeNull();
  });
  it("accepts the observed version and rejects old and pre-migration tokens", async () => {
    cookie(2);
    await expect(validateSession()).resolves.toEqual(account);
    cookie(1);
    await expect(validateSession()).resolves.toBeNull();
    cookie();
    await expect(validateSession()).resolves.toBeNull();
  });
  it("applies revocation to presence as well", async () => {
    cookie(1);
    await expect(validateSessionLite()).resolves.toBeNull();
    cookie(2);
    await expect(validateSessionLite()).resolves.toEqual({ user_id: userId });
  });
  it("rejects stale OAuth versions and consistently prefers the valid custom account", async () => {
    authMock.mockResolvedValue({
      user: { id: "00000000-0000-4000-8000-000000000002", sessionVersion: 1 },
      expires: "",
    });
    await expect(validateSession()).resolves.toBeNull();
    cookie(2);
    await expect(validateSession()).resolves.toEqual(account);
  });
});
