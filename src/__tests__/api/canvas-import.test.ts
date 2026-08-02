import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-error", () => {
  class TestApiError extends Error {
    constructor(
      public statusCode: number,
      public userMessage: string,
    ) {
      super(userMessage);
    }
  }
  return {
    ApiError: TestApiError,
    requireAuth: vi.fn(),
    parseJsonObject: async (request: Request) => {
      try {
        const body = await request.json();
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          throw new TestApiError(400, "JSON body must be an object");
        }
        return body;
      } catch (error) {
        if (error instanceof TestApiError) throw error;
        throw new TestApiError(400, "Invalid JSON body");
      }
    },
    withErrorHandler:
      (handler: (...args: any[]) => Promise<Response>) =>
      async (...args: any[]) => {
        try {
          return await handler(...args);
        } catch (error) {
          const apiError = error as TestApiError;
          return new Response(JSON.stringify({ error: apiError.userMessage }), {
            status: apiError.statusCode ?? 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
  };
});
vi.mock("@/database/pgsql.js", () => ({ default: vi.fn() }));
vi.mock("@/lib/canvas/client.js", () => ({ CanvasClient: vi.fn() }));
vi.mock("@/lib/canvas/credentials", () => ({
  loadCanvasCredentials: vi.fn(),
}));
vi.mock("@/lib/queue", () => ({ enqueueCanvasJob: vi.fn() }));
vi.mock("@/lib/marketing/events", () => ({
  recordActivationMilestone: vi.fn(),
}));

import { requireAuth } from "@/lib/api-error";
import { POST } from "@/app/api/canvas/import/route";

function request(courseIds: unknown[]) {
  return new NextRequest("http://localhost/api/canvas/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ courseIds }),
  });
}

function rawRequest(body: string) {
  return new NextRequest("http://localhost/api/canvas/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/canvas/import Canvas IDs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ user_id: "user-123" } as never);
  });

  it("returns 400 before queueing an ID outside signed bigint range", async () => {
    const response = await POST(request(["9223372036854775808"]));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining("supported Canvas ID range"),
    });
  });

  it("returns 400 for malformed decimal IDs", async () => {
    const response = await POST(request(["42oops"]));
    expect(response.status).toBe(400);
  });

  it("returns 400 for malformed course metadata before queueing", async () => {
    const response = await POST(request([{ id: "42", name: 42 }]));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining("course name must be a string"),
    });
  });

  it.each(["{", "null"])("returns 400 for invalid object JSON %s", async (body) => {
    const response = await POST(rawRequest(body));
    expect(response.status).toBe(400);
  });
});
