import { beforeEach, describe, expect, it, vi } from "vitest";

import sql from "@/database/pgsql";

import {
  generateJWTToken,
  validateSession,
  validateSessionLite,
} from "@/lib/auth";
import { Auth } from "@auth/core";
import { encode } from "next-auth/jwt";
import { authConfig } from "@/auth.config";
import { GET as me } from "@/app/api/auth/me/route";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ cookies: vi.fn(), auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/database/pgsql", () => ({ default: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/i18n/server", () => ({ getRequestLocale: vi.fn() }));
const userId = "00000000-0000-4000-8000-000000000001";
const account = {
  user_id: userId,
  email: "synthetic@example.test",
  session_version: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookies.mockResolvedValue({ get: () => undefined, getAll: () => [] });
  mocks.auth.mockResolvedValue(null);
  vi.mocked(sql).mockImplementation(async (query, ...params) => {
    const text = Array.isArray(query) ? query.join("") : "";
    expect(text).toContain("email_verified = true");
    expect(text).toContain("is_active = true");
    expect(text).toContain("deleted_at IS NULL");
    return params.includes(2) ? [account] : [];
  });
});

function cookie(epoch?: number) {
  const token = generateJWTToken({
    user_id: userId,
    ...(epoch !== undefined && { session_version: epoch }),
  });
  mocks.cookies.mockResolvedValue({
    get: () => ({ name: "session", value: token }),
    getAll: () => [{ name: "session", value: token }],
  });
}

describe("session revocation and identity", () => {
  it("returns503 without expiring cookies when the real Auth.js session action masks a callback outage", async () => {
    const secret = "synthetic-auth-session-fixture-secret";
    const token = await encode({
      secret,
      salt: "authjs.session-token",
      token: { user_id: userId, email: account.email, sessionVersion: 2 },
    });
    const cookie = { name: "authjs.session-token", value: token };
    mocks.cookies.mockResolvedValue({
      get: () => undefined,
      getAll: () => [cookie],
    });
    vi.mocked(sql).mockRejectedValue(new Error("synthetic database outage"));
    mocks.auth.mockImplementationOnce(async () => {
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
    mocks.auth.mockResolvedValue({
      validationUnavailable: true,
      user: { id: userId, sessionVersion: 2 },
      expires: "",
    });
    await expect(validateSession()).rejects.toMatchObject({ statusCode: 503 });
    expect(sql).not.toHaveBeenCalled();
    mocks.auth.mockResolvedValue(null);
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
    mocks.auth.mockResolvedValue({
      user: { id: "00000000-0000-4000-8000-000000000002", sessionVersion: 1 },
      expires: "",
    });
    await expect(validateSession()).resolves.toBeNull();
    cookie(2);
    await expect(validateSession()).resolves.toEqual(account);
    expect(mocks.auth).toHaveBeenCalledTimes(1);
  });
});
