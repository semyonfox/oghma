import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const canvas = vi.hoisted(() => ({
  getDiscoverableCourses: vi.fn(),
  getSelfEnrollments: vi.fn(),
  getCourse: vi.fn(),
}));
type TestRouteHandler = (
  request: NextRequest,
  context: unknown,
) => Promise<Response>;

vi.mock("@/lib/api-error", () => ({
  requireAuth: vi.fn(),
  withErrorHandler:
    (handler: TestRouteHandler) =>
    async (request: NextRequest, context?: unknown) => {
      try {
        return await handler(request, context);
      } catch (error) {
        const apiError = error as { statusCode?: number; userMessage?: string };
        return new Response(JSON.stringify({ error: apiError.userMessage }), {
          status: apiError.statusCode ?? 500,
        });
      }
    },
  ApiError: class extends Error {
    constructor(
      public statusCode: number,
      public userMessage: string,
    ) {
      super(userMessage);
    }
  },
}));
vi.mock("@/lib/canvas/client.js", () => ({
  CanvasClient: vi.fn(function CanvasClient() {
    return canvas;
  }),
}));
vi.mock("@/database/pgsql.js", () => ({ default: vi.fn() }));
vi.mock("@/lib/canvas/credentials", () => ({
  loadCanvasCredentials: vi.fn(),
}));
vi.mock("@/lib/queue", () => ({ enqueueCanvasJob: vi.fn() }));
vi.mock("@/lib/canvas/cancel-import-jobs", () => ({
  cancelActiveCanvasImportJobs: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ default: { warn: vi.fn() } }));

import { requireAuth } from "@/lib/api-error";
import sql from "@/database/pgsql";
import { loadCanvasCredentials } from "@/lib/canvas/credentials";
import { enqueueCanvasJob } from "@/lib/queue";
import { cancelActiveCanvasImportJobs } from "@/lib/canvas/cancel-import-jobs";
import { POST } from "@/app/api/canvas/sync/route";

type SqlWithBegin = {
  begin?: (callback: (tx: typeof sql) => Promise<unknown>) => Promise<unknown>;
};

describe("POST /api/canvas/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (sql as unknown as SqlWithBegin).begin;
    vi.mocked(requireAuth).mockResolvedValue({ user_id: "user-123" } as never);
    vi.mocked(loadCanvasCredentials).mockResolvedValue({
      domain: "example.instructure.com",
      token: "token",
    });
    vi.mocked(sql).mockResolvedValue([
      { canvas_course_id: "9007199254740993" },
    ] as never);
  });

  it("does not silently omit a previously imported course after a transient lookup failure", async () => {
    canvas.getDiscoverableCourses.mockResolvedValue({ data: [] });
    canvas.getSelfEnrollments.mockResolvedValue({
      data: [
        {
          course_id: "9007199254740993",
          enrollment_state: "active",
        },
      ],
    });
    canvas.getCourse.mockResolvedValue({ error: "Canvas API error: 500" });

    const response = await POST(
      new NextRequest("http://localhost/api/canvas/sync", { method: "POST" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      queued: false,
      reason:
        "Canvas could not confirm access to all previously imported courses. Try again later.",
    });
    expect((sql as unknown as { begin?: unknown }).begin).toBeUndefined();
  });

  it("skips automatic sync during the server-side cooldown", async () => {
    vi.mocked(sql)
      .mockReset()
      .mockResolvedValueOnce([
        { canvas_course_id: "9007199254740993" },
      ] as never)
      .mockResolvedValueOnce([
        {
          id: "11111111-1111-4111-8111-111111111111",
          status: "complete",
        },
      ] as never);

    const response = await POST(
      new NextRequest(
        "http://localhost/api/canvas/sync?automatic=true",
        { method: "POST" },
      ),
    );

    expect(await response.json()).toEqual({
      queued: false,
      reason: "Canvas was synced recently",
    });
    expect(canvas.getDiscoverableCourses).not.toHaveBeenCalled();
    expect(cancelActiveCanvasImportJobs).not.toHaveBeenCalled();
    expect(enqueueCanvasJob).not.toHaveBeenCalled();
  });

  it("does not replace a job that wins a concurrent automatic-sync race", async () => {
    const activeJobId = "11111111-1111-4111-8111-111111111111";
    vi.mocked(sql)
      .mockReset()
      .mockResolvedValueOnce([
        { canvas_course_id: "9007199254740993" },
      ] as never)
      .mockResolvedValueOnce([] as never);
    canvas.getDiscoverableCourses.mockResolvedValue({
      data: [
        {
          id: "9007199254740993",
          name: "Software Engineering",
          course_code: "CT216",
        },
      ],
    });
    canvas.getSelfEnrollments.mockResolvedValue({
      data: [
        {
          course_id: "9007199254740993",
          enrollment_state: "active",
        },
      ],
    });
    const tx = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: activeJobId, status: "processing" }]);
    (sql as unknown as SqlWithBegin).begin = vi.fn(async (callback) =>
      callback(tx as unknown as typeof sql),
    );

    const response = await POST(
      new NextRequest(
        "http://localhost/api/canvas/sync?automatic=true",
        { method: "POST" },
      ),
    );

    expect(await response.json()).toEqual({
      queued: false,
      reason: "A Canvas import is already running",
      activeJobId,
    });
    expect(cancelActiveCanvasImportJobs).not.toHaveBeenCalled();
    expect(enqueueCanvasJob).not.toHaveBeenCalled();
    expect(tx.mock.calls[0]?.[0].join("")).toContain(
      "pg_advisory_xact_lock",
    );
  });

  it("queues automatic sync when the cooldown and locked recheck are clear", async () => {
    const jobId = "22222222-2222-4222-8222-222222222222";
    vi.mocked(sql)
      .mockReset()
      .mockResolvedValueOnce([
        { canvas_course_id: "9007199254740993" },
      ] as never)
      .mockResolvedValueOnce([] as never);
    canvas.getDiscoverableCourses.mockResolvedValue({
      data: [
        {
          id: "9007199254740993",
          name: "Software Engineering",
          course_code: "CT216",
        },
      ],
    });
    canvas.getSelfEnrollments.mockResolvedValue({
      data: [
        {
          course_id: "9007199254740993",
          enrollment_state: "active",
        },
      ],
    });
    const tx = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: jobId }]);
    (sql as unknown as SqlWithBegin).begin = vi.fn(async (callback) =>
      callback(tx as unknown as typeof sql),
    );

    const response = await POST(
      new NextRequest(
        "http://localhost/api/canvas/sync?automatic=true",
        { method: "POST" },
      ),
    );

    expect(await response.json()).toEqual({ queued: true, jobId });
    expect(cancelActiveCanvasImportJobs).not.toHaveBeenCalled();
    expect(enqueueCanvasJob).toHaveBeenCalledWith("canvas-discover", {
      jobId,
      userId: "user-123",
    });
  });
});
