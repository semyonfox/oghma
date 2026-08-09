import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const canvas = vi.hoisted(() => ({
  getDiscoverableCourses: vi.fn(),
  getSelfEnrollments: vi.fn(),
  getCourse: vi.fn(),
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
          headers: { "content-type": "application/json" },
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
  parseJsonObject: vi.fn(),
}));
vi.mock("@/lib/canvas/credentials", () => ({
  loadCanvasCredentials: vi.fn(),
}));
vi.mock("@/lib/canvas/client.js", () => ({
  CanvasClient: vi.fn(function CanvasClient() {
    return canvas;
  }),
}));
vi.mock("@/database/pgsql.js", () => ({ default: vi.fn() }));
vi.mock("@/lib/rateLimiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
}));

import sql from "@/database/pgsql.js";
import { parseJsonObject, requireAuth } from "@/lib/api-error";
import { loadCanvasCredentials } from "@/lib/canvas/credentials";
import { GET, POST } from "@/app/api/canvas/connect/route";

describe("GET /api/canvas/connect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ user_id: "user-123" } as never);
    vi.mocked(loadCanvasCredentials).mockResolvedValue({
      domain: "example.instructure.com",
      token: "token",
    });
    vi.mocked(parseJsonObject).mockImplementation(async (request: Request) => {
      try {
        const body = await request.json();
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          throw { statusCode: 400, userMessage: "JSON body must be an object" };
        }
        return body;
      } catch (error) {
        if ((error as { statusCode?: number }).statusCode === 400) throw error;
        throw { statusCode: 400, userMessage: "Invalid JSON body" };
      }
    });
  });

  it("serializes Canvas IDs without eagerly loading every course's modules", async () => {
    canvas.getDiscoverableCourses.mockResolvedValue({
      data: [{ id: "9007199254740993", name: "Algorithms" }],
    });
    vi.mocked(sql).mockResolvedValue([
      { canvas_course_id: "9007199254740993" },
    ] as never);

    const response = await GET(
      new NextRequest("http://localhost/api/canvas/connect"),
    );
    const body = await response.json();

    expect(canvas.getModules).not.toHaveBeenCalled();
    expect(body.courses).toMatchObject([
      {
        id: "9007199254740993",
        name: "Algorithms",
      },
    ]);
    expect(body.forbiddenCourseIds).toEqual(["9007199254740993"]);
  });

  it("returns 502 when Canvas sends an out-of-range course ID", async () => {
    canvas.getDiscoverableCourses.mockResolvedValue({
      data: [{ id: "9223372036854775808", name: "Invalid" }],
    });

    const response = await GET(
      new NextRequest("http://localhost/api/canvas/connect"),
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Canvas returned an invalid course ID",
    });
  });

  it("returns a course found only through the self-enrollment ledger", async () => {
    canvas.getDiscoverableCourses.mockResolvedValue({
      data: [{ id: "42", name: "Current" }],
    });
    canvas.getSelfEnrollments.mockResolvedValue({
      data: [
        {
          course_id: "9007199254740993",
          workflow_state: "completed",
        },
      ],
    });
    vi.mocked(sql).mockResolvedValue([] as never);
    canvas.getCourse.mockResolvedValue({
      data: { id: "9007199254740993", name: "Historical" },
    });

    const response = await GET(
      new NextRequest("http://localhost/api/canvas/connect"),
    );

    expect(response.status).toBe(200);
    expect(canvas.getSelfEnrollments).toHaveBeenCalledOnce();
    expect(canvas.getCourse).toHaveBeenCalledWith("9007199254740993");
    expect((await response.json()).courses).toMatchObject([
      { id: "42", name: "Current" },
      {
        id: "9007199254740993",
        name: "Historical",
        historical: true,
        canvasStatus: "past",
      },
    ]);
  });

  it("keeps a valid connection usable when enrollment access is scoped", async () => {
    canvas.getDiscoverableCourses.mockResolvedValue({
      data: [{ id: "42", name: "Current" }],
    });
    canvas.getSelfEnrollments.mockResolvedValue({
      forbidden: true,
      error: "Access restricted by lecturer",
    });
    vi.mocked(sql).mockResolvedValue([] as never);

    const response = await GET(
      new NextRequest("http://localhost/api/canvas/connect"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      connected: true,
      courseDiscoveryDegraded: true,
      courses: [{ id: "42", name: "Current", canvasStatus: "current" }],
    });
  });

  it.each(["{", "null"])("returns 400 for invalid object JSON %s", async (body) => {
    const response = await POST(
      new NextRequest("http://localhost/api/canvas/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
    );
    expect(response.status).toBe(400);
  });

  it("returns 502 before storing credentials when connect receives an invalid upstream ID", async () => {
    canvas.getDiscoverableCourses.mockResolvedValue({
      data: [{ id: "9223372036854775808", name: "Invalid" }],
    });
    const response = await POST(
      new NextRequest("http://localhost/api/canvas/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          domain: "example.instructure.com",
          token: "token",
        }),
      }),
    );

    expect(response.status).toBe(502);
    // Discovery looks up prior IDs before it validates the token, but an
    // invalid upstream course response must still stop before the credential
    // update query.
    expect(sql).toHaveBeenCalledTimes(1);
  });
});
