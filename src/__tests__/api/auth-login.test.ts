import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  authenticatePassword: vi.fn(),
  getLockoutMinutesRemaining: vi.fn(),
  createAuthSession: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/auth/password-login", () => ({
  authenticatePassword: mocks.authenticatePassword,
}));
vi.mock("@/lib/auth/login-lockout", async (original) => ({
  ...(await original<typeof import("@/lib/auth/login-lockout")>()),
  getLockoutMinutesRemaining: mocks.getLockoutMinutesRemaining,
}));
vi.mock("@/lib/auth/session", async (original) => ({
  ...(await original<typeof import("@/lib/auth/session")>()),
  createAuthSession: mocks.createAuthSession,
}));
vi.mock("@/lib/rate-limiter", async (original) => ({
  ...(await original<typeof import("@/lib/rate-limiter")>()),
  checkRateLimit: mocks.checkRateLimit,
}));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { POST } from "@/app/api/auth/login/route";
import { AuthLockoutStoreUnavailableError } from "@/lib/auth/login-lockout";

function login(body: Record<string, unknown> = {}) {
  return POST(
    new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "203.0.113.7",
      },
      body: JSON.stringify({
        email: "owner@example.test",
        password: "Correct-horse-1",
        ...body,
      }),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getLockoutMinutesRemaining.mockResolvedValue(0);
  mocks.checkRateLimit.mockResolvedValue(null);
  mocks.createAuthSession.mockResolvedValue(NextResponse.json({ success: true }));
});

describe("POST /api/auth/login", () => {
  it("answers a deactivated account with the generic error until the password matches", async () => {
    mocks.authenticatePassword.mockResolvedValue({ status: "invalid" });
    const response = await login();
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid email or password",
    });

    mocks.authenticatePassword.mockResolvedValue({ status: "deactivated" });
    expect((await login()).status).toBe(403);
  });

  // per-email lockout alone lets one ip try a password across many accounts
  it("refuses an ip over the login budget before checking any password", async () => {
    mocks.checkRateLimit.mockResolvedValue(
      NextResponse.json({ error: "Too many requests" }, { status: 429 }),
    );
    const response = await login();
    expect(response.status).toBe(429);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("login", "203.0.113.7");
    expect(mocks.authenticatePassword).not.toHaveBeenCalled();
  });

  it("tells a locked user how long to wait", async () => {
    mocks.authenticatePassword.mockResolvedValue({ status: "rate_limited" });
    mocks.getLockoutMinutesRemaining.mockResolvedValue(12);
    const response = await login();
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      error: "Account temporarily locked. Try again in 12 minutes.",
    });
  });

  it("fails closed with 503 when the lockout store is down", async () => {
    mocks.authenticatePassword.mockRejectedValue(new AuthLockoutStoreUnavailableError());
    const response = await login();
    expect(response.status).toBe(503);
    expect(mocks.createAuthSession).not.toHaveBeenCalled();
  });

  it("sends an unverified owner to verification", async () => {
    mocks.authenticatePassword.mockResolvedValue({
      status: "unverified",
      email: "owner@example.test",
    });
    const response = await login();
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      requiresVerification: true,
      email: "owner@example.test",
    });
  });

  it("issues a 30 day session only when remember me is set", async () => {
    const user = {
      user_id: "00000000-0000-4000-8000-000000000001",
      email: "owner@example.test",
      session_version: 2,
    };
    mocks.authenticatePassword.mockResolvedValue({ status: "ok", user });
    await login({ rememberMe: true });
    expect(mocks.createAuthSession).toHaveBeenLastCalledWith(user, 30);
    await login();
    expect(mocks.createAuthSession).toHaveBeenLastCalledWith(user, 1);
  });
});
