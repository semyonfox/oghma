import { beforeEach, describe, expect, it, vi, type MockedFunction } from "vitest";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

vi.mock("@/database/pgsql", () => {
  const sqlMock = vi.fn();
  sqlMock.mockResolvedValue([]);
  return { default: sqlMock };
});

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({
  validateSession: vi.fn(),
  createErrorResponse: (message: string, status = 400, additionalData: Record<string, unknown> = {}) =>
    Response.json(
      { success: false, error: message, ...additionalData },
      { status },
    ),
  parseJsonBody: vi.fn(async (request: Request) => {
    try {
      const data = await request.json();
      return { data, error: null };
    } catch {
      return {
        data: null,
        error: Response.json(
          { success: false, error: "Invalid JSON in request body" },
          { status: 400 },
        ),
      };
    }
  }),
}));

vi.mock("@/lib/logger", () => ({
  default: {
    error: vi.fn(),
  },
}));

import sql from "@/database/pgsql";
import { validateSession } from "@/lib/auth";
import { POST } from "@/app/api/auth/change-password/route";

const MOCK_USER = { user_id: "user-123", email: "test@example.com" };

const sqlMock = sql as unknown as MockedFunction<(...args: unknown[]) => Promise<unknown[]>>;
const compareMock = bcrypt.compare as unknown as MockedFunction<(value: string, hash: string) => Promise<boolean>>;
const hashMock = bcrypt.hash as unknown as MockedFunction<(value: string, rounds: number) => Promise<string>>;

function makeRequest(body: Record<string, string>) {
  return new NextRequest("http://localhost/api/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(validateSession).mockResolvedValue(MOCK_USER);
  sqlMock.mockResolvedValue([]);
});

describe("POST /api/auth/change-password", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(validateSession).mockResolvedValue(null);

    const response = await POST(
      makeRequest({ currentPassword: "OldPass123", newPassword: "NewPass123" }),
    );

    expect(response.status).toBe(401);
  });

  it("rejects an incorrect current password", async () => {
    sqlMock.mockResolvedValueOnce([{ hashed_password: "stored-hash" }]);
    compareMock.mockResolvedValue(false);

    const response = await POST(
      makeRequest({
        currentPassword: "WrongPass123",
        newPassword: "NewPass123",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Current password is incorrect");
  });

  it("updates the password when the current password is valid", async () => {
    sqlMock
      .mockResolvedValueOnce([{ hashed_password: "stored-hash" }])
      .mockResolvedValueOnce([]);
    compareMock.mockResolvedValue(true);
    hashMock.mockResolvedValue("new-hash");

    const response = await POST(
      makeRequest({ currentPassword: "OldPass123", newPassword: "NewPass123" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(hashMock).toHaveBeenCalledWith("NewPass123", 10);
    expect(sqlMock).toHaveBeenCalledTimes(2);
  });
});
