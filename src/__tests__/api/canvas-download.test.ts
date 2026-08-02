import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockGetPaginatedPath } = vi.hoisted(() => ({
  mockGetPaginatedPath: vi.fn(),
}));

vi.mock("@/lib/api-error", () => ({
  requireAuth: vi.fn(),
  withErrorHandler:
    (handler: (request: NextRequest) => Promise<Response>) =>
    async (request: NextRequest) => {
      try {
        return await handler(request);
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
  parseJsonObject: async (request: Request) => {
    try {
      const body = await request.json();
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        const error = new Error("JSON body must be an object") as Error & {
          statusCode: number;
          userMessage: string;
        };
        error.statusCode = 400;
        error.userMessage = "JSON body must be an object";
        throw error;
      }
      return body;
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode === 400) throw error;
      const invalid = new Error("Invalid JSON body") as Error & {
        statusCode: number;
        userMessage: string;
      };
      invalid.statusCode = 400;
      invalid.userMessage = "Invalid JSON body";
      throw invalid;
    }
  },
}));

vi.mock("@/lib/canvas/credentials", () => ({
  loadCanvasCredentials: vi.fn(),
}));

vi.mock("@/lib/canvas/client.js", () => ({
  CanvasClient: vi.fn(function CanvasClient(this: Record<string, unknown>) {
    this.client = true;
    this.getPaginatedPath = mockGetPaginatedPath;
  }),
}));

vi.mock("@/lib/canvas/raw-export.js", () => ({
  discoverCanvasRawExportEntries: vi.fn(),
  createCanvasRawExportZipStream: vi.fn(),
}));

import { requireAuth } from "@/lib/api-error";
import { loadCanvasCredentials } from "@/lib/canvas/credentials";
import { CanvasClient } from "@/lib/canvas/client.js";
import {
  createCanvasRawExportZipStream,
  discoverCanvasRawExportEntries,
} from "@/lib/canvas/raw-export.js";
import { POST } from "@/app/api/canvas/download/route";

describe("POST /api/canvas/download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPaginatedPath.mockReset();
    vi.mocked(requireAuth).mockResolvedValue({ user_id: "u1" } as never);
    vi.mocked(loadCanvasCredentials).mockResolvedValue({
      domain: "canvas.example.edu",
      token: "token",
    } as never);
    vi.mocked(discoverCanvasRawExportEntries).mockResolvedValue({
      downloads: [{ path: "course/file.pdf", file: { url: "https://file" } }],
      textEntries: [{ path: "course/page.md", content: "# Page\n" }],
      skipped: [],
    } as never);
    vi.mocked(createCanvasRawExportZipStream).mockReturnValue(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("zip"));
          controller.close();
        },
      }) as never,
    );
  });

  it("returns a zip archive for selected courses", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/canvas/download", {
        method: "POST",
        body: JSON.stringify({
          courseIds: [{ id: 123, name: "Course", course_code: "CT216" }],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="canvas-export-\d{4}-\d{2}-\d{2}\.zip"$/,
    );
    expect(CanvasClient).toHaveBeenCalledWith("canvas.example.edu", "token");
    expect(discoverCanvasRawExportEntries).toHaveBeenCalledWith(
      expect.any(Object),
      [{ id: "123", name: "Course", course_code: "CT216", term: null }],
      expect.objectContaining({
        courseDiscovery: expect.objectContaining({
          mode: "selected",
          course_count: 1,
        }),
      }),
    );
    expect(await response.text()).toBe("zip");
  });

  it("discovers all accessible courses when no course list is posted", async () => {
    mockGetPaginatedPath.mockImplementation(async (path: string) => {
      if (path.includes("enrollment_state=active")) {
        return {
          data: [
            {
              id: 123,
              name: "Active Course",
              course_code: "AC101",
              term: { name: "2026" },
            },
          ],
          forbidden: false,
        };
      }
      if (path.includes("enrollment_state=completed")) {
        return {
          data: [
            {
              id: 456,
              name: "Completed Course",
              course_code: "CC101",
              term: { name: "2025" },
            },
          ],
          forbidden: false,
        };
      }
      return { data: [], forbidden: false };
    });

    const response = await POST(
      new NextRequest("http://localhost/api/canvas/download", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(200);
    expect(discoverCanvasRawExportEntries).toHaveBeenCalledWith(
      expect.any(Object),
      [
        {
          id: "123",
          name: "Active Course",
          course_code: "AC101",
          term: { name: "2026" },
        },
        {
          id: "456",
          name: "Completed Course",
          course_code: "CC101",
          term: { name: "2025" },
        },
      ],
      expect.objectContaining({
        courseDiscovery: expect.objectContaining({
          mode: "all_discoverable",
          course_count: 2,
        }),
      }),
    );
  });

  it.each(["{", "null"])(
    "rejects malformed or non-object JSON instead of exporting every course: %s",
    async (body) => {
      const response = await POST(
        new NextRequest("http://localhost/api/canvas/download", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        }),
      );

      expect(response.status).toBe(400);
      expect(discoverCanvasRawExportEntries).not.toHaveBeenCalled();
    },
  );

  it.each([
    JSON.stringify({ courseIds: "123" }),
    JSON.stringify({ courseIds: [] }),
    JSON.stringify({ courseIds: [{ id: "123", course_code: 123 }] }),
  ])(
    "rejects an invalid selected-course field instead of exporting every course: %s",
    async (body) => {
      const response = await POST(
        new NextRequest("http://localhost/api/canvas/download", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        }),
      );

      expect(response.status).toBe(400);
      expect(discoverCanvasRawExportEntries).not.toHaveBeenCalled();
    },
  );
});
