import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const deferred = vi.hoisted(() => [] as Array<() => Promise<void>>);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (callback: () => Promise<void>) => {
    deferred.push(callback);
  },
}));

async function runDeferred() {
  for (const callback of deferred.splice(0)) await callback();
}

vi.mock("@/database/pgsql", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  createErrorResponse: (error: string, status: number) =>
    Response.json({ error }, { status }),
  parseJsonBody: async (request: Request) => ({
    data: await request.json(),
    error: null,
  }),
}));
vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
  getClientIp: () => "198.51.100.4",
}));
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendVerificationEmail: vi.fn(),
}));
vi.mock("@/lib/api-error", () => ({
  ApiError: class ApiError extends Error {
    constructor(
      readonly statusCode: number,
      readonly userMessage: string,
    ) {
      super(userMessage);
    }
  },
  assertTrustedOrigin: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn() },
}));

import sql from "@/database/pgsql";
import { EmailSendError, sendVerificationEmail } from "@/lib/email";
import logger from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limiter";
import { POST } from "@/app/api/auth/resend-verification/route";

const mockSql = vi.mocked(sql);

function request() {
  return new NextRequest("https://example.com/api/auth/resend-verification", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "student@example.com" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  deferred.length = 0;
  mockSql.mockResolvedValue([]);
  vi.mocked(checkRateLimit).mockResolvedValue(null);
  vi.mocked(sendVerificationEmail).mockResolvedValue("delivered");
});

describe("verification resend", () => {
  it("rotates a token without creating another account", async () => {
    mockSql.mockResolvedValueOnce([
      {
        user_id: "user-1",
        email: "student@example.com",
        email_verified: false,
        locale: "de-DE",
        verification_token: "previous-hash",
        verification_token_expires: new Date("2026-09-26T00:00:00Z"),
      },
    ]).mockResolvedValueOnce([{ user_id: "user-1" }]);

    const response = await POST(request());
    expect(response.status).toBe(200);
    // delivery happens after the response so its latency can't reveal the account
    expect(sendVerificationEmail).not.toHaveBeenCalled();
    await runDeferred();

    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(sendVerificationEmail).toHaveBeenCalledWith(
      "student@example.com",
      expect.any(String),
      "de-DE",
    );
    const statements = mockSql.mock.calls.map(([strings]) => String(strings));
    expect(statements.some((statement) => statement.includes("UPDATE app.login"))).toBe(true);
    expect(statements.some((statement) => statement.includes("INSERT"))).toBe(false);
  });

  it("preserves the previous link when the provider rejects the resend", async () => {
    const previousExpiry = new Date("2026-09-26T00:00:00Z");
    mockSql.mockResolvedValueOnce([
      {
        user_id: "user-1",
        email: "student@example.com",
        email_verified: false,
        locale: null,
        verification_token: "previous-hash",
        verification_token_expires: previousExpiry,
      },
    ]).mockResolvedValueOnce([{ user_id: "user-1" }]);
    vi.mocked(sendVerificationEmail).mockRejectedValue(
      new EmailSendError("provider_rejected", 503, 10002),
    );

    const response = await POST(request());
    await runDeferred();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      message: "If that email needs verification, a new link has been requested.",
    });
    expect(mockSql).toHaveBeenCalledTimes(3);
    const restoreCall = mockSql.mock.calls[2];
    expect(String(restoreCall[0])).toContain("SET verification_token = ");
    expect(restoreCall.slice(1)).toContain("previous-hash");
    expect(restoreCall.slice(1)).toContain(previousExpiry);
    expect(mockSql.mock.calls.some(([strings]) => String(strings).includes("INSERT"))).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      "resend verification email failed",
      { reason: "provider_rejected", httpStatus: 503, providerCode: 10002 },
    );
  });

  it("uses the same public response for an unknown address and a failed resend", async () => {
    const unknownResponse = await POST(request());
    const unknownBody = await unknownResponse.json();

    mockSql.mockResolvedValueOnce([
      {
        user_id: "user-1",
        email: "student@example.com",
        email_verified: false,
        locale: null,
        verification_token: "previous-hash",
        verification_token_expires: null,
      },
    ]).mockResolvedValueOnce([{ user_id: "user-1" }]);
    vi.mocked(sendVerificationEmail).mockRejectedValue(
      new EmailSendError("transport"),
    );

    const failedResponse = await POST(request());

    expect(failedResponse.status).toBe(unknownResponse.status);
    await expect(failedResponse.json()).resolves.toEqual(unknownBody);
  });

  it("does not send a link if the account changed during resend", async () => {
    mockSql.mockResolvedValueOnce([
      {
        user_id: "user-1",
        email: "student@example.com",
        email_verified: false,
        locale: null,
        verification_token: "previous-hash",
        verification_token_expires: null,
      },
    ]).mockResolvedValueOnce([]);

    const response = await POST(request());
    await runDeferred();

    expect(response.status).toBe(200);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("caps resends per ip before looking up any address", async () => {
    vi.mocked(checkRateLimit).mockImplementation(async (category) =>
      category === "resend-verification-ip"
        ? NextResponse.json({ error: "Too many requests" }, { status: 429 })
        : null,
    );
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith("resend-verification-ip", "198.51.100.4");
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("only looks up live unverified accounts", async () => {
    await POST(request());
    const [lookup] = mockSql.mock.calls[0];
    expect(String(lookup)).toContain("email_verified = false");
    expect(String(lookup)).toContain("deleted_at IS NULL");
  });
});
