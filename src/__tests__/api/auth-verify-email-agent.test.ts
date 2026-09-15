import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { tx, sql } = vi.hoisted(() => {
  const transaction = vi.fn();
  return {
    tx: transaction,
    sql: Object.assign(vi.fn(), { begin: vi.fn() }),
  };
});

vi.mock("@/database/pgsql", () => ({ default: sql }));
vi.mock("@/lib/auth", () => ({
  createAuthSession: vi.fn().mockResolvedValue(Response.json({ success: true })),
  createErrorResponse: (error: string, status = 400) =>
    Response.json({ success: false, error }, { status }),
  parseJsonBody: async (request: Request) => ({
    data: await request.json(),
    error: null,
  }),
}));
vi.mock("@/lib/tokens", () => ({ hashToken: vi.fn(() => "stored-hash") }));
vi.mock("@/lib/rateLimiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
  getClientIp: vi.fn(() => "127.0.0.1"),
}));
vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn(), warn: vi.fn() },
}));
vi.mock("@/lib/api-error", () => ({ assertTrustedOrigin: vi.fn() }));
vi.mock("@/lib/marketing/events", () => ({
  recordActivationMilestone: vi.fn().mockResolvedValue(undefined),
}));

import { createAuthSession } from "@/lib/auth";
import { POST } from "@/app/api/auth/verify-email/route";

function request() {
  return new NextRequest("https://oghmanotes.ie/api/auth/verify-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "verification-token" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  tx.mockReset();
  tx
    .mockResolvedValueOnce([
      {
        user_id: "00000000-0000-4000-8000-000000000001",
        email: "student@example.com",
      },
    ])
    .mockResolvedValueOnce([]);
  sql.begin.mockReset();
  sql.begin.mockImplementation(async (callback) => callback(tx));
});

describe("email verification with an agent registration claim", () => {
  it("commits account verification and claim completion in one transaction", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(sql.begin).toHaveBeenCalledOnce();
    expect(tx).toHaveBeenCalledTimes(2);
    expect(createAuthSession).toHaveBeenCalledWith(
      {
        user_id: "00000000-0000-4000-8000-000000000001",
        email: "student@example.com",
      },
      1,
    );
  });

  it("does not create a session when the atomic verification transaction fails", async () => {
    tx
      .mockReset()
      .mockResolvedValueOnce([
        {
          user_id: "00000000-0000-4000-8000-000000000001",
          email: "student@example.com",
        },
      ])
      .mockRejectedValueOnce(new Error("db failed"));

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(createAuthSession).not.toHaveBeenCalled();
  });

  it("rejects a token that another request already consumed", async () => {
    tx.mockReset().mockResolvedValueOnce([]);

    const response = await POST(request());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid or expired verification token",
    });
    expect(tx).toHaveBeenCalledOnce();
    expect(createAuthSession).not.toHaveBeenCalled();
  });
});
