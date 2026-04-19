import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";

vi.mock("@/database/pgsql.js", () => {
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

vi.mock("@/lib/auth.js", () => ({
  validateSession: vi.fn(),
  createErrorResponse: (message, status = 400, additionalData = {}) =>
    Response.json(
      { success: false, error: message, ...additionalData },
      { status },
    ),
  parseJsonBody: vi.fn(async (request) => {
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

import sql from "@/database/pgsql.js";
import { validateSession } from "@/lib/auth.js";
import { POST } from "@/app/api/auth/change-password/route.js";

const MOCK_USER = { user_id: "user-123", email: "test@example.com" };

function makeRequest(body) {
  return new Request("http://localhost/api/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(validateSession).mockResolvedValue(MOCK_USER);
  vi.mocked(sql).mockResolvedValue([]);
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
    vi.mocked(sql).mockResolvedValueOnce([{ hashed_password: "stored-hash" }]);
    vi.mocked(bcrypt.compare).mockResolvedValue(false);

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
    vi.mocked(sql)
      .mockResolvedValueOnce([{ hashed_password: "stored-hash" }])
      .mockResolvedValueOnce([]);
    vi.mocked(bcrypt.compare).mockResolvedValue(true);
    vi.mocked(bcrypt.hash).mockResolvedValue("new-hash");

    const response = await POST(
      makeRequest({ currentPassword: "OldPass123", newPassword: "NewPass123" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(bcrypt.hash).toHaveBeenCalledWith("NewPass123", 10);
    expect(sql).toHaveBeenCalledTimes(2);
  });
});
