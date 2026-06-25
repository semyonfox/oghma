import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/database/pgsql.js", () => {
  const sqlMock = vi.fn();
  return { default: sqlMock };
});

vi.mock("@/lib/auth", () => ({
  validateSession: vi.fn(),
}));

vi.mock("@/lib/embedText", () => ({
  embedText: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}));

vi.mock("@/lib/qdrant", () => ({
  searchChunkVectors: vi.fn().mockResolvedValue([
    {
      chunkId: "chunk-semantic",
      documentId: "note-semantic",
      userId: "user-123",
      score: 0.91,
      distance: 0.09,
    },
  ]),
}));

vi.mock("@/lib/logger", () => ({
  default: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import sql from "@/database/pgsql.js";
import { validateSession } from "@/lib/auth";
import { embedText } from "@/lib/embedText";
import { searchChunkVectors } from "@/lib/qdrant";
import { GET } from "@/app/api/global-search/route";

function request(query = "algorithms") {
  return new NextRequest(`http://localhost/api/global-search?q=${query}`);
}

describe("GET /api/global-search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateSession).mockResolvedValue({
      user_id: "user-123",
    } as never);
    vi.mocked(sql).mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join("");

      if (text.includes("CASE WHEN content IS NOT NULL")) {
        return Promise.resolve([
          {
            note_id: "note-keyword",
            title: "Algorithms Note",
            snippet: "# Sorting and graphs",
          },
        ]) as any;
      }

      if (text.includes("WITH course_stats") || text.includes("WITH hit_courses")) {
        return Promise.resolve([
          {
            canvas_course_id: 216,
            course_name: "Software Engineering",
            total_cards: 12,
            due_count: 3,
            mastered_count: 6,
          },
        ]) as any;
      }

      if (text.includes("FROM app.chunks c")) {
        return Promise.resolve([
          {
            note_id: "note-semantic",
            title: "Complexity Notes",
            chunk_id: "chunk-semantic",
            snippet: "Big O and runtime analysis",
          },
        ]) as any;
      }

      if (text.includes("FROM app.chat_sessions s") && text.includes("MAX(CASE")) {
        return Promise.resolve([
          {
            id: "chat-1",
            title: "Exam prep",
            message_count: 4,
            snippet: "We discussed algorithms and proofs",
          },
        ]) as any;
      }

      return Promise.resolve([]) as any;
    });
  });

  it("requires authentication", async () => {
    vi.mocked(validateSession).mockResolvedValue(null as never);

    const response = await GET(request());

    expect(response.status).toBe(401);
  });

  it("does not return recent content for a one-character query", async () => {
    const response = await GET(request("a"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toEqual({
      notes: [],
      chats: [],
      quizzes: [],
    });
    expect(sql).not.toHaveBeenCalled();
    expect(embedText).not.toHaveBeenCalled();
  });

  it("returns destinations for notes, semantic notes, chats, and quizzes", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results.notes).toEqual([
      expect.objectContaining({
        id: "note-keyword",
        source: "keyword",
        href: "/notes/note-keyword",
      }),
      expect.objectContaining({
        id: "note-semantic",
        source: "semantic",
        href: "/notes/note-semantic",
      }),
    ]);
    expect(body.results.chats[0]).toEqual(
      expect.objectContaining({
        id: "chat-1",
        type: "chat",
        href: "/chat/chat-1",
      }),
    );
    expect(body.results.quizzes[0]).toEqual(
      expect.objectContaining({
        id: "216",
        type: "quiz",
        href: "/quiz",
      }),
    );
    expect(embedText).toHaveBeenCalledWith("algorithms");
    expect(searchChunkVectors).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-123",
        excludeDocumentIds: ["note-keyword"],
      }),
    );
  });
});
