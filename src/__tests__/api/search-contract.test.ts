import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  validateSession: vi.fn(),
}));

vi.mock("@/database/pgsql.js", () => ({ default: mocks.sql }));
vi.mock("@/lib/auth", () => ({
  validateSession: mocks.validateSession,
  validateSessionLite: vi.fn(),
}));
vi.mock("@/lib/embedText", () => ({ embedText: vi.fn() }));
vi.mock("@/lib/qdrant", () => ({ searchChunkVectors: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { GET } from "@/app/api/search/route";

describe("GET /api/search Canvas course contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateSession.mockResolvedValue({
      user_id: "123e4567-e89b-42d3-a456-426614174000",
      email: "user@example.com",
    });
  });

  it.each(["not-an-id", "9223372036854775808"])(
    "returns a traced 400 for invalid course ID %s",
    async (courseId) => {
      const response = await GET(
        new NextRequest(
          `http://localhost/api/search?q=graphs&course=${courseId}`,
        ),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: "Invalid course ID",
        traceId: expect.stringMatching(/^(?!no-trace$).+/),
      });
      expect(mocks.sql).not.toHaveBeenCalled();
    },
  );
});
