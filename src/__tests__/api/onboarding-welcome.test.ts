import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  requireAuth: vi.fn(),
}));

vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));
vi.mock("@/lib/api-error", () => ({
  requireAuth: mocks.requireAuth,
  withErrorHandler: (handler: unknown) => handler,
}));

import { GET, POST } from "@/app/api/onboarding/welcome/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuth.mockResolvedValue({ user_id: "current-user" });
});

describe("first-login welcome", () => {
  it("returns the pending note for the current account", async () => {
    mocks.sql.mockResolvedValue([{ note_id: "550e8400-e29b-41d4-a716-446655440000" }]);

    const response = await GET(new NextRequest("http://localhost/api/onboarding/welcome"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      noteId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(mocks.sql.mock.calls[0][1]).toBe("current-user");
  });

  it("does not show a welcome to an account without a pending note", async () => {
    mocks.sql.mockResolvedValue([]);

    const response = await GET(new NextRequest("http://localhost/api/onboarding/welcome"));

    await expect(response.json()).resolves.toEqual({ noteId: null });
  });

  it("clears the pending marker for the current account", async () => {
    mocks.sql.mockResolvedValue([]);

    const response = await POST(new NextRequest("http://localhost/api/onboarding/welcome", {
      method: "POST",
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ dismissed: true });
    expect(mocks.sql.mock.calls[0][1]).toBe("current-user");
  });

  it("does not read or clear a welcome without an authenticated account", async () => {
    mocks.requireAuth.mockRejectedValue(new Error("Unauthorized"));

    await expect(GET(new NextRequest("http://localhost/api/onboarding/welcome")))
      .rejects.toThrow("Unauthorized");
    await expect(POST(new NextRequest("http://localhost/api/onboarding/welcome", {
      method: "POST",
    }))).rejects.toThrow("Unauthorized");
    expect(mocks.sql).not.toHaveBeenCalled();
  });
});
