import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  const sql = Object.assign(vi.fn(), {
    begin: vi.fn(),
  });
  return { sql, validateSession: vi.fn(), cancelUserJobs: vi.fn() };
});

vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));
vi.mock("@/lib/auth/cancel-user-jobs", () => ({
  cancelUserJobs: mocks.cancelUserJobs,
}));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/auth/session", async (original) => ({
  ...(await original<typeof import("@/lib/auth/session")>()),
  validateSession: mocks.validateSession,
}));
vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { POST as logout } from "@/app/api/auth/logout/route";
import { DELETE as deleteAccount } from "@/app/api/auth/delete-account/route";

const COOKIES =
  "session=a; __Secure-authjs.session-token.0=b; __Secure-authjs.session-token.1=c";

function expiredCookies(response: Response): string[] {
  return response.headers
    .getSetCookie()
    .filter((cookie) => /max-age=0/i.test(cookie))
    .map((cookie) => cookie.split("=")[0]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sql.mockResolvedValue([]);
  mocks.sql.begin.mockImplementation(async (work: (tx: typeof mocks.sql) => unknown) =>
    work(mocks.sql),
  );
  mocks.cancelUserJobs.mockResolvedValue({ canvasJobs: 0, studyJobs: 0 });
  mocks.validateSession.mockResolvedValue({
    user_id: "00000000-0000-4000-8000-000000000001",
    email: "owner@example.test",
    session_version: 0,
  });
});

describe("POST /api/auth/logout", () => {
  it("expires chunked Auth.js session cookies as well as the custom JWT", async () => {
    const response = await logout(
      new NextRequest("https://example.test/api/auth/logout", {
        method: "POST",
        headers: { Cookie: COOKIES },
      }),
    );
    expect(response.status).toBe(200);
    expect(expiredCookies(response)).toEqual(
      expect.arrayContaining([
        "session",
        "__Secure-authjs.session-token",
        "__Secure-authjs.session-token.0",
        "__Secure-authjs.session-token.1",
        "__Host-authjs.csrf-token",
      ]),
    );
  });
});

describe("DELETE /api/auth/delete-account", () => {
  function deleteRequest(body: string) {
    return new NextRequest("https://example.test/api/auth/delete-account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Cookie: COOKIES },
      body,
    });
  }

  it("revokes sessions and stored credentials, then clears every session cookie", async () => {
    const response = await deleteAccount(
      deleteRequest(JSON.stringify({ confirmation: "delete my account" })),
    );
    expect(response.status).toBe(200);

    const update = String(mocks.sql.mock.calls[0][0]);
    for (const revoked of [
      "session_version = session_version + 1",
      "calendar_export_token = NULL",
      "reset_token = NULL",
      "verification_token = NULL",
      "canvas_token = NULL",
      "deleted_at IS NULL",
    ]) {
      expect(update).toContain(revoked);
    }
    // queued imports and study jobs stop in the same transaction as the flag
    expect(mocks.cancelUserJobs).toHaveBeenCalledWith(
      mocks.sql,
      "00000000-0000-4000-8000-000000000001",
    );
    expect(expiredCookies(response)).toEqual(
      expect.arrayContaining([
        "session",
        "__Secure-authjs.session-token.0",
        "__Secure-authjs.session-token.1",
      ]),
    );
  });

  it("rejects a missing confirmation without touching the account", async () => {
    const response = await deleteAccount(deleteRequest(JSON.stringify({})));
    expect(response.status).toBe(400);
    expect(mocks.sql).not.toHaveBeenCalled();
    expect(mocks.cancelUserJobs).not.toHaveBeenCalled();
  });

  it("bounds the request body", async () => {
    const response = await deleteAccount(
      deleteRequest(JSON.stringify({ confirmation: "x".repeat(4096) })),
    );
    expect(response.status).toBe(413);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
});
