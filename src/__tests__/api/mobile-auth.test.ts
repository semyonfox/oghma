import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  getActiveUser: vi.fn(),
  findActiveUser: vi.fn(),
  issueGrant: vi.fn(),
  consumeGrant: vi.fn(),
  checkRateLimit: vi.fn(),
  getClientIp: vi.fn(() => "127.0.0.1"),
  createAuthSession: vi.fn(),
}));

vi.mock("@/lib/mobile-auth", () => {
  class MobileAuthStoreUnavailableError extends Error {}
  return {
    MOBILE_AUTH_CODE_PATTERN: /^[A-Za-z0-9_-]{43}$/,
    MOBILE_AUTH_STATE_PATTERN: /^[0-9a-f]{64}$/i,
    MOBILE_AUTH_CODE_VERIFIER_PATTERN: /^[A-Za-z0-9._~-]{43,128}$/,
    MobileAuthStoreUnavailableError,
    getActiveAuthJsMobileUser: mocks.getActiveUser,
    findActiveMobileAuthUser: mocks.findActiveUser,
    issueMobileAuthGrant: mocks.issueGrant,
    consumeMobileAuthGrant: mocks.consumeGrant,
  };
});
vi.mock("@/lib/rateLimiter", () => ({
  checkRateLimit: mocks.checkRateLimit,
  getClientIp: mocks.getClientIp,
}));
vi.mock("@/lib/auth", () => ({
  createAuthSession: mocks.createAuthSession,
  validateSession: vi.fn(),
  validateSessionLite: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { GET, POST as AUTHORIZE } from "@/app/api/auth/mobile/authorize/route";
import { POST as EXCHANGE } from "@/app/api/auth/mobile/exchange/route";
import { MobileAuthStoreUnavailableError } from "@/lib/mobile-auth";

const USER = {
  user_id: "00000000-0000-4000-8000-000000000001",
  email: "student@example.com",
  displayName: "Student",
};
const STATE = "a".repeat(64);
const CODE = "c".repeat(43);
const CHALLENGE = "h".repeat(43);
const VERIFIER = "v".repeat(64);

function request(
  path: "authorize" | "exchange",
  body?: Record<string, unknown>,
  origin = "https://oghmanotes.ie",
) {
  return new NextRequest(`https://oghmanotes.ie/api/auth/mobile/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      "x-forwarded-for": "127.0.0.1",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getActiveUser.mockResolvedValue(USER);
  mocks.findActiveUser.mockResolvedValue(USER);
  mocks.issueGrant.mockResolvedValue(CODE);
  mocks.consumeGrant.mockResolvedValue(USER.user_id);
  mocks.checkRateLimit.mockResolvedValue(null);
  mocks.createAuthSession.mockResolvedValue(
    NextResponse.json({ success: true, user: USER }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/auth/mobile/authorize", () => {
  it("requires an active Auth.js browser identity", async () => {
    mocks.getActiveUser.mockResolvedValue(null);

    const response = await GET(
      new NextRequest("https://oghmanotes.ie/api/auth/mobile/authorize"),
    );

    expect(response.status).toBe(401);
  });

  it("returns the browser account for explicit confirmation", async () => {
    const response = await GET(
      new NextRequest("https://oghmanotes.ie/api/auth/mobile/authorize"),
    );

    await expect(response.json()).resolves.toEqual({ user: USER });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("POST /api/auth/mobile/authorize", () => {
  it("issues only a code and the caller state in the fixed app URL", async () => {
    const response = await AUTHORIZE(
      request("authorize", { state: STATE, codeChallenge: CHALLENGE }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      url: `ie.oghmanotes.alpha://auth?code=${CODE}&state=${STATE}`,
    });
    expect(JSON.stringify(body)).not.toContain("student@example.com");
    expect(mocks.issueGrant).toHaveBeenCalledWith(USER.user_id, CHALLENGE);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      "mobile-auth-authorize",
      USER.user_id,
    );
  });

  it("rejects malformed state and challenge values", async () => {
    const response = await AUTHORIZE(
      request("authorize", { state: "short", codeChallenge: "bad" }),
    );

    expect(response.status).toBe(400);
    expect(mocks.getActiveUser).not.toHaveBeenCalled();
    expect(mocks.issueGrant).not.toHaveBeenCalled();
  });

  it("rejects an untrusted origin", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const response = await AUTHORIZE(
      request(
        "authorize",
        { state: STATE, codeChallenge: CHALLENGE },
        "https://evil.example.com",
      ),
    );

    expect(response.status).toBe(403);
    expect(mocks.issueGrant).not.toHaveBeenCalled();
  });

  it("returns a per-user rate-limit response before issuing a grant", async () => {
    mocks.checkRateLimit.mockResolvedValue(
      NextResponse.json({ error: "Too many requests" }, { status: 429 }),
    );

    const response = await AUTHORIZE(
      request("authorize", { state: STATE, codeChallenge: CHALLENGE }),
    );

    expect(response.status).toBe(429);
    expect(mocks.issueGrant).not.toHaveBeenCalled();
  });

  it("fails closed when the grant store is unavailable", async () => {
    mocks.issueGrant.mockRejectedValue(new MobileAuthStoreUnavailableError());

    const response = await AUTHORIZE(
      request("authorize", { state: STATE, codeChallenge: CHALLENGE }),
    );

    expect(response.status).toBe(503);
  });
});

describe("POST /api/auth/mobile/exchange", () => {
  it("creates a 30-day custom session after consuming a valid grant", async () => {
    const response = await EXCHANGE(
      request("exchange", { code: CODE, codeVerifier: VERIFIER }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.consumeGrant).toHaveBeenCalledWith(CODE, VERIFIER);
    expect(mocks.findActiveUser).toHaveBeenCalledWith(USER.user_id);
    expect(mocks.createAuthSession).toHaveBeenCalledWith(USER, 30);
  });

  it("returns the same rejection for wrong, replayed, or expired codes", async () => {
    mocks.consumeGrant.mockResolvedValue(null);

    const response = await EXCHANGE(
      request("exchange", { code: CODE, codeVerifier: VERIFIER }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid or expired authorization code",
    });
    expect(mocks.createAuthSession).not.toHaveBeenCalled();
  });

  it("rejects malformed codes and PKCE verifiers", async () => {
    const response = await EXCHANGE(
      request("exchange", { code: "short", codeVerifier: "contains spaces" }),
    );

    expect(response.status).toBe(400);
    expect(mocks.consumeGrant).not.toHaveBeenCalled();
  });

  it("does not create a session when the account was disabled before exchange", async () => {
    mocks.findActiveUser.mockResolvedValue(null);

    const response = await EXCHANGE(
      request("exchange", { code: CODE, codeVerifier: VERIFIER }),
    );

    expect(response.status).toBe(403);
    expect(mocks.createAuthSession).not.toHaveBeenCalled();
  });

  it("applies a fail-closed public rate limit before parsing the grant", async () => {
    mocks.checkRateLimit.mockResolvedValue(
      NextResponse.json({ error: "Store unavailable" }, { status: 503 }),
    );

    const response = await EXCHANGE(
      request("exchange", { code: CODE, codeVerifier: VERIFIER }),
    );

    expect(response.status).toBe(503);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      "mobile-auth-exchange",
      "127.0.0.1",
    );
    expect(mocks.consumeGrant).not.toHaveBeenCalled();
  });

  it("fails closed when Redis becomes unavailable during exchange", async () => {
    mocks.consumeGrant.mockRejectedValue(new MobileAuthStoreUnavailableError());

    const response = await EXCHANGE(
      request("exchange", { code: CODE, codeVerifier: VERIFIER }),
    );

    expect(response.status).toBe(503);
    expect(mocks.createAuthSession).not.toHaveBeenCalled();
  });
});
