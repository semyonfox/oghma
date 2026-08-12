import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  validateSession: vi.fn(),
  embedText: vi.fn(),
  searchChunkVectors: vi.fn(),
}));

vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));
vi.mock("@/lib/auth", () => ({
  validateSession: mocks.validateSession,
  validateSessionLite: vi.fn(),
}));
vi.mock("@/lib/embedText", () => ({ embedText: mocks.embedText }));
vi.mock("@/lib/qdrant", () => ({
  searchChunkVectors: mocks.searchChunkVectors,
}));
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
    mocks.embedText.mockResolvedValue([0.1, 0.2, 0.3]);
    mocks.searchChunkVectors.mockResolvedValue([]);
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

  it("keeps the semantic response contract while applying the course filter", async () => {
    mocks.searchChunkVectors.mockResolvedValue([
      { chunkId: "chunk-other", distance: 0.1 },
      { chunkId: "chunk-course", distance: 0.2 },
    ]);
    mocks.sql.mockResolvedValue([
      {
        note_id: "note-other",
        title: "Other course",
        chunk_id: "chunk-other",
        chunk_text: "Other material",
        canvas_course_id: "100",
      },
      {
        note_id: "note-course",
        title: "Graph theory",
        chunk_id: "chunk-course",
        chunk_text: "Graphs and trees",
        canvas_course_id: "216",
      },
    ]);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/search?q=graphs&mode=semantic&course=216",
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      results: [
        {
          note_id: "note-course",
          title: "Graph theory",
          snippet: "Graphs and trees",
          distance: 0.2,
          source: "semantic",
        },
      ],
    });
  });
});
