import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const canvas = vi.hoisted(() => ({
  getCourses: vi.fn(),
  getModules: vi.fn(),
}));

vi.mock("@/lib/api-error", () => ({
  requireAuth: vi.fn(),
  withErrorHandler:
    (handler: (...args: any[]) => Promise<Response>) =>
    async (...args: any[]) => {
      try {
        return await handler(...args);
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
vi.mock("@/lib/canvas/credentials", () => ({
  loadCanvasCredentials: vi.fn(),
}));
vi.mock("@/lib/canvas/client.js", () => ({
  CanvasClient: vi.fn(function CanvasClient() {
    return canvas;
  }),
}));

import { requireAuth } from "@/lib/api-error";
import { loadCanvasCredentials } from "@/lib/canvas/credentials";
import { GET } from "@/app/api/canvas/courses/route";

describe("GET /api/canvas/courses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ user_id: "user-123" } as never);
    vi.mocked(loadCanvasCredentials).mockResolvedValue({
      domain: "example.instructure.com",
      token: "token",
    });
  });

  it("returns 502 rather than retrying serialization for an invalid upstream ID", async () => {
    canvas.getCourses.mockResolvedValue({
      data: [{ id: "9223372036854775808", name: "Invalid" }],
    });

    const response = await GET(
      new NextRequest("http://localhost/api/canvas/courses"),
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Canvas returned an invalid course ID",
    });
  });
});
