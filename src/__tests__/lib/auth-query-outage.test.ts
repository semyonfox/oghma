import { beforeEach, expect, it, vi } from "vitest";
import { Auth } from "@auth/core";
import { encode } from "next-auth/jwt";
import { NextRequest } from "next/server";
import sql from "@/database/pgsql";
import { authConfig } from "@/auth.config";
import { GET as me } from "@/app/api/auth/me/route";

const mocks = vi.hoisted(() => ({ cookies: vi.fn(), auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/database/pgsql", () => ({ default: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/i18n/server", () => ({ getRequestLocale: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

it("preserves Auth.js cookies when account validation fails despite a healthy connection", async () => {
  const secret = "synthetic-query-outage-fixture-secret";
  const cookieName = "authjs.session-token";
  const token = await encode({
    secret,
    salt: cookieName,
    token: {
      user_id: "00000000-0000-4000-8000-000000000001",
      email: "synthetic@example.test",
      sessionVersion: 2,
    },
  });
  const cookie = { name: cookieName, value: token };
  const coreErrors = vi.fn();
  mocks.cookies.mockResolvedValue({
    get: () => undefined,
    getAll: () => [cookie],
  });
  vi.mocked(sql).mockImplementation(async (query) => {
    const text = Array.isArray(query) ? query.join("") : "";
    if (text.includes("FROM app.login")) {
      throw new Error("synthetic account-query timeout");
    }
    if (/SELECT\s+1\b/.test(text)) return [{ "?column?": 1 }];
    throw new Error("unexpected fixture query");
  });
  mocks.auth.mockImplementation(async () => {
    const response = await Auth(
      new Request("https://example.test/api/auth/session", {
        headers: { Cookie: `${cookie.name}=${cookie.value}` },
      }),
      {
        ...authConfig,
        basePath: "/api/auth",
        secret,
        trustHost: true,
        useSecureCookies: false,
        logger: { error: coreErrors },
      },
    );
    const session: unknown = await response.json();
    return session;
  });

  const response = await me(
    new NextRequest("https://example.test/api/auth/me"),
  );
  expect(coreErrors).not.toHaveBeenCalled();
  expect(
    vi
      .mocked(sql)
      .mock.calls.some(
        ([query]) =>
          Array.isArray(query) && query.join("").includes("FROM app.login"),
      ),
  ).toBe(true);
  expect(response.status).toBe(503);
  expect(response.headers.get("set-cookie")).toBeNull();
});
