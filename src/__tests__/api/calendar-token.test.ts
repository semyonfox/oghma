import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  validateSession: vi.fn(),
}));

vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));
vi.mock("@/lib/auth/session", () => ({
  validateSession: mocks.validateSession,
  validateSessionLite: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { GET, POST } from "@/app/api/calendar/token/route";

const USER_ID = "123e4567-e89b-42d3-a456-426614174000";
const TOKEN = "11111111-1111-4111-8111-111111111111";

function call(handler: typeof GET, method: string) {
  return handler(new NextRequest("http://localhost/api/calendar/token", { method }));
}

describe("calendar feed token route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateSession.mockResolvedValue({ user_id: USER_ID, email: "user@example.com" });
  });

  it("returns an existing token without rotating it", async () => {
    mocks.sql.mockResolvedValueOnce([{ calendar_export_token: TOKEN }]);

    const response = await call(GET, "GET");

    expect(await response.json()).toEqual({ token: TOKEN });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.sql).toHaveBeenCalledTimes(1);
  });

  it("issues a token for an account that never had one", async () => {
    mocks.sql
      .mockResolvedValueOnce([{ calendar_export_token: null }])
      .mockResolvedValueOnce([{ calendar_export_token: TOKEN }]);

    const response = await call(GET, "GET");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ token: TOKEN });
    const issueQuery = (mocks.sql.mock.calls[1][0] as TemplateStringsArray).join("?");
    // a concurrent first request must not rotate the token the other one returned
    expect(issueQuery).toMatch(/COALESCE\(calendar_export_token, gen_random_uuid\(\)\)/);
  });

  it("rotates the token on POST", async () => {
    mocks.sql.mockResolvedValueOnce([{ calendar_export_token: TOKEN }]);

    const response = await call(POST, "POST");

    expect(await response.json()).toEqual({ token: TOKEN });
    const query = (mocks.sql.mock.calls[0][0] as TemplateStringsArray).join("?");
    expect(query).toMatch(/SET calendar_export_token = gen_random_uuid\(\)/);
  });

  it("requires a session", async () => {
    mocks.validateSession.mockResolvedValue(null);

    const response = await call(GET, "GET");

    expect(response.status).toBe(401);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
});
