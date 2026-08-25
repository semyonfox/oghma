import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const canvas = vi.hoisted(() => ({
  getSelfEnrollments: vi.fn(),
  getDiscoverableCourses: vi.fn(),
  getCourses: vi.fn(),
}));
type TestRouteHandler = (
  request: NextRequest,
  context: unknown,
) => Promise<Response>;

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
      (handler: TestRouteHandler) =>
      async (request: NextRequest, context?: unknown) => {
        try {
          return await handler(request, context);
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
vi.mock("@/database/pgsql", () => ({ default: vi.fn() }));
vi.mock("@/lib/canvas/client", () => ({
  CanvasClient: vi.fn(function CanvasClient() {
    return canvas;
  }),
}));
vi.mock("@/lib/canvas/credentials", () => ({
  loadCanvasCredentials: vi.fn(),
}));
vi.mock("@/lib/queue", () => ({ enqueueCanvasJob: vi.fn() }));
vi.mock("@/lib/marketing/events", () => ({
  recordActivationMilestone: vi.fn(),
}));
vi.mock("@/lib/canvas/cancel-import-jobs", () => ({
  cancelActiveCanvasImportJobs: vi.fn().mockResolvedValue([]),
}));

import { requireAuth } from "@/lib/api-error";
import sql from "@/database/pgsql";
import { loadCanvasCredentials } from "@/lib/canvas/credentials";
import { enqueueCanvasJob } from "@/lib/queue";
import { recordActivationMilestone } from "@/lib/marketing/events";
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
    vi.mocked(loadCanvasCredentials).mockResolvedValue({
      domain: "example.instructure.com",
      token: "token",
    });
    canvas.getSelfEnrollments.mockResolvedValue({ data: [] });
    vi.mocked(enqueueCanvasJob).mockResolvedValue(undefined);
    vi.mocked(recordActivationMilestone).mockResolvedValue(true);
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

  it("uses self enrollments to validate token liveness before queueing", async () => {
    const tx = vi.fn().mockResolvedValue([{ id: "job-123" }]);
    const begin = vi.fn(async (callback) => callback(tx));
    Object.assign(sql, { begin });
    canvas.getSelfEnrollments.mockResolvedValue({ data: [] });

    const response = await POST(request(["9007199254740993"]));

    expect(response.status).toBe(200);
    expect(canvas.getSelfEnrollments).toHaveBeenCalledOnce();
    expect(canvas.getCourses).not.toHaveBeenCalled();
    expect(begin).toHaveBeenCalledOnce();
    expect(enqueueCanvasJob).toHaveBeenCalledWith("canvas-discover", {
      jobId: "job-123",
      userId: "user-123",
    });
  });

  it("falls back to the regular course list when enrollment access is scoped", async () => {
    const tx = vi.fn().mockResolvedValue([{ id: "job-456" }]);
    const begin = vi.fn(async (callback) => callback(tx));
    Object.assign(sql, { begin });
    canvas.getSelfEnrollments.mockResolvedValue({
      forbidden: true,
      error: "Access restricted by lecturer",
    });
    canvas.getDiscoverableCourses.mockResolvedValue({ data: [] });

    const response = await POST(request(["9007199254740993"]));

    expect(response.status).toBe(200);
    expect(canvas.getDiscoverableCourses).toHaveBeenCalledOnce();
  });

  it("uses the structured unauthorized flag for expired tokens", async () => {
    canvas.getSelfEnrollments.mockResolvedValue({
      unauthorized: true,
      error: "A provider-specific token error",
    });

    const response = await POST(request(["42"]));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Canvas token is invalid or expired",
    });
  });
});
