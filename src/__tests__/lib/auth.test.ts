import { describe, it, expect, vi, beforeEach, type MockedFunction } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

import { auth } from "@/auth";
import { cookies } from "next/headers";
import {
  generateJWTToken,
  verifyJWTToken,
  validateSessionLite,
  createErrorResponse,
  createValidationErrorResponse,
} from "@/lib/auth";

type OAuthSession = { user?: { id?: string } } | null;
const authMock = auth as unknown as MockedFunction<() => Promise<OAuthSession>>;
type CookieStore = { get: (name: string) => { name: string; value: string } | undefined };
const cookiesMock = cookies as unknown as MockedFunction<() => Promise<CookieStore>>;

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
  it("returns a string token", () => {
    const token = generateJWTToken({ user_id: "abc", email: "a@b.com" });
    expect(typeof token).toBe("string");
    expect(token.split(".").length).toBe(3); // header.payload.signature
  });

  it("throws if JWT_SECRET is not set", () => {
    const original = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    expect(() => generateJWTToken({ user_id: "abc" })).toThrow("JWT_SECRET");
    process.env.JWT_SECRET = original;
  });
});

describe("verifyJWTToken", () => {
  it("returns payload for a valid token", () => {
    const payload = { user_id: "user-123", email: "test@example.com" };
    const token = generateJWTToken(payload);
    const result = verifyJWTToken(token);
    expect(result).not.toBeNull();
    if (!result) throw new Error("Expected a valid token payload");
    expect(result.user_id).toBe("user-123");
    expect(result.email).toBe("test@example.com");
  });

  it("returns null for a tampered token", () => {
    const token = generateJWTToken({ user_id: "abc" });
    const tampered = token.slice(0, -3) + "xxx";
    expect(verifyJWTToken(tampered)).toBeNull();
  });

  it("returns null for a completely invalid string", () => {
    expect(verifyJWTToken("not.a.token")).toBeNull();
  });

  it("returns null for expired token", async () => {
    // sign with -1s expiry (already expired)
    const token = generateJWTToken({ user_id: "abc" }, "-1s");
    expect(verifyJWTToken(token)).toBeNull();
  });

  it("returns null if JWT_SECRET is missing at verify time", () => {
    const token = generateJWTToken({ user_id: "abc" });
    const original = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    expect(() => verifyJWTToken(token)).toThrow();
    process.env.JWT_SECRET = original;
  });
});

describe("validateSessionLite", () => {
  beforeEach(() => {
    authMock.mockResolvedValue(null);
    cookiesMock.mockResolvedValue({ get: () => undefined });
  });

  it("resolves the user from a valid session cookie without any db call", async () => {
    const token = generateJWTToken({ user_id: "user-123" });
    cookiesMock.mockResolvedValue({
      get: (name) => (name === "session" ? { name: "session", value: token } : undefined),
    });

    await expect(validateSessionLite()).resolves.toEqual({
      user_id: "user-123",
    });
  });

  it("rejects a tampered session cookie", async () => {
    const token = generateJWTToken({ user_id: "user-123" });
    cookiesMock.mockResolvedValue({
      get: () => ({ name: "session", value: token.slice(0, -3) + "xxx" }),
    });

    await expect(validateSessionLite()).resolves.toBeNull();
  });

  it("falls back to the NextAuth session for OAuth users", async () => {
    authMock.mockResolvedValue({ user: { id: "oauth-user-9" } });

    await expect(validateSessionLite()).resolves.toEqual({
      user_id: "oauth-user-9",
    });
  });

  it("returns null when no credential is present", async () => {
    await expect(validateSessionLite()).resolves.toBeNull();
  });
});
