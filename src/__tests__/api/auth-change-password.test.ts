import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/database/pgsql", () => {
  const sqlMock = vi.fn();
  sqlMock.mockResolvedValue([]);
  return { default: sqlMock };
});

vi.mock("@/lib/auth", () => ({
  validateSession: vi.fn(),
  createErrorResponse: (
    message: string,
    status = 400,
    additionalData: Record<string, unknown> = {},
  ) =>
    Response.json(
      { success: false, error: message, ...additionalData },
      { status },
    ),
}));

vi.mock("@/lib/email", () => ({
  sendPasswordResetEmail: vi.fn(),
}));

vi.mock("@/lib/tokens", () => ({
  generateSecureToken: vi.fn(),
  hashToken: vi.fn(),
}));

vi.mock("@/lib/rateLimiter", () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  default: {
    error: vi.fn(),
  },
}));

import sql from "@/database/pgsql";
import { POST } from "@/app/api/auth/change-password/route";
import { validateSession } from "@/lib/auth";
import { sendPasswordResetEmail } from "@/lib/email";
import { checkRateLimit } from "@/lib/rateLimiter";
import { generateSecureToken, hashToken } from "@/lib/tokens";

const MOCK_USER = { user_id: "user-123", email: "test@example.com" };

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/auth/change-password", {
    method: "POST",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(validateSession).mockResolvedValue(MOCK_USER);
  vi.mocked(sql).mockResolvedValue([]);
  vi.mocked(checkRateLimit).mockResolvedValue(null);
  vi.mocked(generateSecureToken).mockReturnValue("raw-reset-token");
  vi.mocked(hashToken).mockReturnValue("hashed-reset-token");
  vi.mocked(sendPasswordResetEmail).mockResolvedValue(undefined);
});

describe("POST /api/auth/change-password", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(validateSession).mockResolvedValue(null);

    const response = await POST(makeRequest());

    expect(response.status).toBe(401);
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("does not offer a password flow to accounts without password sign-in", async () => {
    vi.mocked(sql).mockResolvedValueOnce([
      { email: "test@example.com", hashed_password: null },
    ]);

    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Password sign-in is not enabled for this account");
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("sends an email-confirmed password-change link instead of changing a password directly", async () => {
    vi.mocked(sql)
      .mockResolvedValueOnce([
        { email: "test@example.com", hashed_password: "stored-hash" },
      ])
      .mockResolvedValueOnce([]);

    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      message:
        "We sent a verification link to your email. Click the link to verify your account.",
    });
    expect(checkRateLimit).toHaveBeenCalledWith("change-password", "user-123");
    expect(generateSecureToken).toHaveBeenCalledOnce();
    expect(hashToken).toHaveBeenCalledWith("raw-reset-token");
    expect(sendPasswordResetEmail).toHaveBeenCalledWith(
      "test@example.com",
      "raw-reset-token",
      "/change-password",
    );
    expect(sql).toHaveBeenCalledTimes(2);
  });
});
