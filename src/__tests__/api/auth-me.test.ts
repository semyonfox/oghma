import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  validateSession: vi.fn(),
  getLinkedProviders: vi.fn(),
  sql: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/auth", () => ({ validateSession: mocks.validateSession }));
vi.mock("@/lib/auth-oauth", () => ({
  getLinkedProviders: mocks.getLinkedProviders,
}));
vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));
vi.mock("@/lib/logger", () => ({
  default: { error: mocks.loggerError },
}));

import { GET } from "@/app/api/auth/me/route";

describe("GET /api/auth/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue(null);
    mocks.validateSession.mockResolvedValue(null);
    mocks.getLinkedProviders.mockResolvedValue([]);
  });

  it("returns 401 only when both session mechanisms confirm no user", async () => {
    const response = await GET(
      new Request("http://localhost/api/auth/me") as never,
    );

    expect(response.status).toBe(401);
  });

  it("returns 503 when profile lookup prevents identity verification", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "user-1", email: "person@example.com", name: "Person" },
    });
    mocks.sql.mockRejectedValue(new Error("database unavailable"));

    const response = await GET(
      new Request("http://localhost/api/auth/me") as never,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Unable to verify session",
    });
  });
});
