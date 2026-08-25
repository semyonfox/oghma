import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const canvas = vi.hoisted(() => ({
  getDiscoverableCourses: vi.fn(),
  getSelfEnrollments: vi.fn(),
  getCourse: vi.fn(),
}));

vi.mock("@/lib/api-error", () => ({
  requireAuth: vi.fn(),
  withErrorHandler:
    (handler: () => Promise<Response>) =>
    async () => {
      try {
        return await handler();
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
import { POST } from "@/app/api/canvas/sync/route";

describe("POST /api/canvas/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
