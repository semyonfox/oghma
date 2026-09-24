import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("@/database/pgsql", () => {
  const sql = vi.fn() as ReturnType<typeof vi.fn> & {
    begin: ReturnType<typeof vi.fn>;
  };
  sql.begin = vi.fn();
  return { default: sql };
});
vi.mock("@/lib/rateLimiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@/lib/auth", () => ({
  createErrorResponse: (error: string, status: number) =>
    Response.json({ error }, { status }),
  createValidationErrorResponse: (validationErrors: unknown) =>
    Response.json({ validationErrors }, { status: 400 }),
  parseJsonBody: async (request: Request) => ({
    data: await request.json(),
    error: null,
  }),
}));
vi.mock("@/lib/agent-registration", () => ({
  validateAgentRegistrationForSignup: vi.fn(),
}));
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendVerificationEmail: vi.fn(),
}));
vi.mock("@/lib/api-error", () => ({
  withErrorHandler: (handler: unknown) => handler,
}));
vi.mock("@/lib/notes/storage/create-note", () => ({
  insertNoteWithTree: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/i18n/server", () => ({
  getRequestLocale: vi.fn().mockResolvedValue("en"),
}));
vi.mock("@/lib/marketing/events", () => ({
  recordMarketingEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn(), warn: vi.fn() },
}));
vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn().mockResolvedValue("hashed-password") },
}));

import sql from "@/database/pgsql";
import { sendVerificationEmail } from "@/lib/email";
import { getRequestLocale } from "@/lib/i18n/server";
import { insertNoteWithTree } from "@/lib/notes/storage/create-note";
import { Locale } from "@/locales";
import { POST } from "@/app/api/auth/register/route";

const mockSql = sql as unknown as ReturnType<typeof vi.fn> & {
  begin: ReturnType<typeof vi.fn>;
};

function request(password = "ValidPass123") {
  return new NextRequest("https://example.com/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "student@example.com",
      password,
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getRequestLocale).mockResolvedValue(Locale.EN);
  mockSql.mockResolvedValue([]);
  const tx = vi.fn().mockResolvedValue([{ user_id: "user-1" }]);
  mockSql.begin.mockImplementation(
    async (callback: (transaction: typeof tx) => Promise<unknown>) =>
      callback(tx),
  );
  vi.mocked(sendVerificationEmail).mockResolvedValue("delivered");
});

describe("registration delivery feedback", () => {
  it("returns the shared password policy error for a short password", async () => {
    const response = await POST(request("Short1"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      validationErrors: {
        password: expect.stringContaining("at least 8 characters"),
      },
    });
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("seeds a German starter note for a German first visit", async () => {
    vi.mocked(getRequestLocale).mockResolvedValueOnce(Locale.de_DE);

    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(insertNoteWithTree).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        title: "Erste Schritte",
        content: expect.stringContaining("Einstellungen → Canvas"),
      }),
    );
    expect(sendVerificationEmail).toHaveBeenCalledWith(
      "student@example.com",
      expect.any(String),
      Locale.de_DE,
    );
  });

  it("reports a queued verification email", async () => {
    vi.mocked(sendVerificationEmail).mockResolvedValue("queued");

    const response = await POST(request());

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      requiresVerification: true,
      emailDelivery: "queued",
    });
  });

  it("keeps the new account and offers resend when email sending fails", async () => {
    vi.mocked(sendVerificationEmail).mockRejectedValue(
      new Error("test transport failure"),
    );

    const response = await POST(request());

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      requiresVerification: true,
      emailDelivery: "failed",
      message: expect.stringContaining("Try resending"),
    });
    expect(mockSql.begin).toHaveBeenCalledTimes(1);
  });

  it("does not create a second account when registration is retried", async () => {
    const first = await POST(request());
    expect(first.status).toBe(201);
    mockSql.mockResolvedValueOnce([{ user_id: "user-1" }]);

    const retry = await POST(request());

    expect(retry.status).toBe(409);
    expect(mockSql.begin).toHaveBeenCalledTimes(1);
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
  });
});
