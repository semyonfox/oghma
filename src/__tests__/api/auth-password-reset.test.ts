import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const deferred = vi.hoisted(() => [] as Array<() => Promise<void>>);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (callback: () => Promise<void>) => {
    deferred.push(callback);
  },
}));
vi.mock("@/database/pgsql", () => {
  const sql = vi.fn() as ReturnType<typeof vi.fn> & {
    begin: ReturnType<typeof vi.fn>;
  };
  sql.begin = vi.fn();
  return { default: sql };
});
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
  getClientIp: () => "127.0.0.1",
}));
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendPasswordResetEmail: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import sql from "@/database/pgsql";
import { checkRateLimit } from "@/lib/rate-limiter";
import { EmailSendError, sendPasswordResetEmail } from "@/lib/email";
import { POST as requestReset } from "@/app/api/auth/password-reset/request/route";
import { POST as verifyReset } from "@/app/api/auth/password-reset/verify/route";

const mockSql = vi.mocked(sql);

function post(url: string, body: Record<string, unknown>) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function runDeferred() {
  for (const callback of deferred.splice(0)) await callback();
}

beforeEach(() => {
  vi.clearAllMocks();
  deferred.length = 0;
  mockSql.mockResolvedValue([]);
  vi.mocked(checkRateLimit).mockResolvedValue(null);
  vi.mocked(sendPasswordResetEmail).mockResolvedValue(undefined);
});

describe("POST /api/auth/password-reset/request", () => {
  const url = "http://localhost/api/auth/password-reset/request";

  it("gives a failed delivery the same answer as an unknown address", async () => {
    const unknown = await requestReset(post(url, { email: "missing@example.test" }));
    const unknownBody = await unknown.json();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();

    mockSql
      .mockResolvedValueOnce([{ user_id: "user-1", email: "Owner@Example.test" }])
      .mockResolvedValueOnce([]);
    vi.mocked(sendPasswordResetEmail).mockRejectedValue(new EmailSendError("transport"));
    const known = await requestReset(post(url, { email: " OWNER@example.test " }));
    await runDeferred();

    expect(known.status).toBe(unknown.status);
    await expect(known.json()).resolves.toEqual(unknownBody);
    // the link goes to the stored mailbox, not whatever casing was typed
    expect(sendPasswordResetEmail).toHaveBeenCalledWith(
      "Owner@Example.test",
      expect.stringMatching(/^[0-9a-f]{64}$/),
    );
    expect(checkRateLimit).toHaveBeenLastCalledWith("password-reset", "owner@example.test");
  });

  it("caps reset requests per ip before looking up any address", async () => {
    vi.mocked(checkRateLimit).mockImplementation(async (category) =>
      category === "password-reset-ip"
        ? NextResponse.json({ error: "Too many requests" }, { status: 429 })
        : null,
    );
    const response = await requestReset(post(url, { email: "victim@example.test" }));
    expect(response.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith("password-reset-ip", "127.0.0.1");
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("never issues a reset link for a deactivated account", async () => {
    await requestReset(post(url, { email: "owner@example.test" }));
    const [lookup] = mockSql.mock.calls[0];
    expect(String(lookup)).toContain("is_active = true");
    expect(String(lookup)).toContain("deleted_at IS NULL");
  });
});

describe("POST /api/auth/password-reset/verify", () => {
  it("explains a weak password with a readable error string", async () => {
    const response = await verifyReset(
      post("http://localhost/api/auth/password-reset/verify", {
        token: "a".repeat(64),
        password: "weakpassword",
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toEqual(expect.stringContaining("uppercase"));
    expect(sql.begin).not.toHaveBeenCalled();
  });
});
