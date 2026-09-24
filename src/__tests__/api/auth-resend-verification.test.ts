import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/database/pgsql", () => ({ default: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  createErrorResponse: (error: string, status: number) =>
    Response.json({ error }, { status }),
  parseJsonBody: async (request: Request) => ({
    data: await request.json(),
    error: null,
  }),
}));
vi.mock("@/lib/rateLimiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
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
  mockSql.mockResolvedValue([]);
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
      },
    ]);

    const response = await POST(request());

    expect(response.status).toBe(200);
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

  it("gives a retry action when the provider rejects the resend", async () => {
    mockSql.mockResolvedValueOnce([
      {
        user_id: "user-1",
        email: "student@example.com",
        email_verified: false,
      },
    ]);
    vi.mocked(sendVerificationEmail).mockRejectedValue(
      new EmailSendError("provider_rejected", 503, 10002),
    );

    const response = await POST(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("try again later"),
    });
    expect(mockSql.mock.calls.some(([strings]) => String(strings).includes("INSERT"))).toBe(false);
  });
});
