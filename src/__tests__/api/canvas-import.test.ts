import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const canvas = vi.hoisted(() => ({
  getSelfEnrollments: vi.fn(),
  getDiscoverableCourses: vi.fn(),
  getCourse: vi.fn(),
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
vi.mock("@/lib/canvas/trash-conflicts", async (original) => ({
  ...await original<typeof import("@/lib/canvas/trash-conflicts")>(),
  findCanvasTrashConflicts: vi.fn().mockResolvedValue([]),
}));
import { findCanvasTrashConflicts } from "@/lib/canvas/trash-conflicts";
vi.mock("@/database/pgsql", () => ({ default: vi.fn() }));
vi.mock("@/lib/canvas/client", () => ({
  CanvasClient: vi.fn(function CanvasClient() {
    return canvas;
  }),
}));
vi.mock("@/lib/canvas/credentials", () => ({
  loadCanvasCredentials: vi.fn(),
  markCanvasTokenInvalid: vi.fn(),
  clearCanvasTokenInvalid: vi.fn(),
}));
vi.mock("@/lib/queue", () => ({ enqueueCanvasDiscoverJob: vi.fn() }));
vi.mock("@/lib/marketing/events", () => ({
  recordActivationMilestone: vi.fn(),
}));
vi.mock("@/lib/canvas/cancel-import-jobs", () => ({
  cancelActiveCanvasImportJobs: vi.fn().mockResolvedValue([]),
}));

import { requireAuth } from "@/lib/api-error";
import sql from "@/database/pgsql";
import { loadCanvasCredentials } from "@/lib/canvas/credentials";
import { enqueueCanvasDiscoverJob } from "@/lib/queue";
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
  beforeEach(() => vi.stubEnv("CANVAS_CONTENT_IMPORT", "on"));
  afterEach(() => vi.unstubAllEnvs());

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findCanvasTrashConflicts).mockResolvedValue([]);
    vi.mocked(requireAuth).mockResolvedValue({ user_id: "user-123" } as never);
    vi.mocked(loadCanvasCredentials).mockResolvedValue({
      domain: "example.instructure.com",
      token: "token",
    });
    canvas.getSelfEnrollments.mockResolvedValue({ data: [] });
    canvas.getDiscoverableCourses.mockResolvedValue({
      data: [{ id: "42", name: "2526-CT216 Software Engineering I", course_code: "2526-CT216", term: null }],
    });
    canvas.getCourse.mockResolvedValue({ forbidden: true });
    vi.mocked(enqueueCanvasDiscoverJob).mockResolvedValue(undefined);
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

  it("requires a Trash choice before creating a new job", async () => {
    const tx = vi.fn().mockResolvedValue([]);
    Object.assign(sql, { begin: vi.fn(async (callback) => callback(tx)) });
    const folders = [{ rootId: "root", title: "Course", deletedAt: "2026-09-15T00:00:00.000Z" }];
    vi.mocked(findCanvasTrashConflicts).mockResolvedValue(folders);
    const response = await POST(request(["42"]));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: "canvas_folders_in_trash", folders });
    expect(enqueueCanvasDiscoverJob).not.toHaveBeenCalled();
    expect(tx.mock.calls.some(([parts]) => Array.from(parts).join("").includes("INSERT INTO"))).toBe(false);
  });

  it("queues Canvas's own course record, not the name the client sent", async () => {
    const tx = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValue([{ id: "job-123" }]);
    const begin = vi.fn(async (callback) => callback(tx));
    Object.assign(sql, { begin });

    const response = await POST(request([{ id: "42", name: "Canvas course unavailable", course_code: "" }]));

    expect(response.status).toBe(200);
    const written = JSON.stringify(tx.mock.calls);
    expect(written).toContain("2526-CT216 Software Engineering I");
    expect(written).not.toContain("Canvas course unavailable");
    expect(enqueueCanvasDiscoverJob).toHaveBeenCalledWith("job-123", "user-123");
  });

  it("refuses a course Canvas will not serve instead of importing a placeholder", async () => {
    const begin = vi.fn();
    Object.assign(sql, { begin });
    canvas.getSelfEnrollments.mockResolvedValue({
      data: [{ course_id: "56263", enrollment_state: "active" }],
    });

    const response = await POST(request([{ id: "56263", name: "Canvas course unavailable", course_code: "" }]));

    expect(response.status).toBe(400);
    expect(canvas.getCourse).toHaveBeenCalledWith("56263");
    expect(begin).not.toHaveBeenCalled();
    expect(enqueueCanvasDiscoverJob).not.toHaveBeenCalled();
  });

  it("falls back to the regular course list when enrollment access is scoped", async () => {
    const tx = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValue([{ id: "job-456" }]);
    const begin = vi.fn(async (callback) => callback(tx));
    Object.assign(sql, { begin });
    canvas.getSelfEnrollments.mockResolvedValue({
      forbidden: true,
      error: "Access restricted by lecturer",
    });

    const response = await POST(request(["42"]));

    expect(response.status).toBe(200);
    expect(canvas.getDiscoverableCourses).toHaveBeenCalledOnce();
  });

  it("uses the structured unauthorized flag for expired tokens", async () => {
    const expired = { unauthorized: true, error: "A provider-specific token error" };
    canvas.getSelfEnrollments.mockResolvedValue(expired);
    canvas.getDiscoverableCourses.mockResolvedValue(expired);

    const response = await POST(request(["42"]));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Canvas token is invalid or expired",
    });
  });
});

describe("POST /api/canvas/import while content import is paused", () => {
  it("refuses before queueing anything", async () => {
    vi.mocked(requireAuth).mockResolvedValue({ user_id: "user-123" } as never);
    const response = await POST(request(["42"]));
    expect(response.status).toBe(403);
    expect(enqueueCanvasDiscoverJob).not.toHaveBeenCalled();
  });
});
