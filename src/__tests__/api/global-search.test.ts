import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/database/pgsql", () => {
  const sqlMock = vi.fn();
  return { default: sqlMock };
});

vi.mock("@/lib/auth/session", () => ({
  validateSession: vi.fn(),
}));

vi.mock("@/lib/rag/embeddings", () => ({
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

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn(),
}));

import sql from "@/database/pgsql";
import { validateSession } from "@/lib/auth/session";
import { embedText } from "@/lib/rag/embeddings";
import { searchChunkVectors } from "@/lib/qdrant";
import { checkRateLimit } from "@/lib/rate-limiter";
import { GET } from "@/app/api/global-search/route";

type SqlCall = [TemplateStringsArray, ...unknown[]];

function request(query = "algorithms") {
  return new NextRequest(`http://localhost/api/global-search?q=${query}`);
}

describe("GET /api/global-search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateSession).mockResolvedValue({
      user_id: "user-123",
    } as never);
    vi.mocked(checkRateLimit).mockResolvedValue(null);
    vi.mocked(sql).mockImplementation(((strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("");

      // nested fragments come back as markers the outer query can inspect
      if (text.startsWith("AND n.canvas_course_id = ANY(")) {
        return { courseScope: values[0] };
      }

      if (text.includes("CASE WHEN content IS NOT NULL")) {
        return Promise.resolve([
          {
            note_id: "note-keyword",
            title: "Algorithms Note",
            snippet: "# Sorting and graphs",
          },
        ]);
      }

      if (text.includes("SELECT DISTINCT n.canvas_course_id")) {
        return Promise.resolve([
          { canvas_course_id: "216" },
          { canvas_course_id: "300" },
        ]);
      }

      if (text.includes("WITH course_stats")) {
        // the semantic lookup scopes by course id; the name match does not
        const scoped = values.some(
          (value) => typeof value === "object" && value !== null && "courseScope" in value,
        );
        return Promise.resolve([
          {
            canvas_course_id: scoped ? "300" : "216",
            course_name: scoped ? "Algorithms" : "Software Engineering",
            total_cards: 12,
            due_count: 3,
            mastered_count: 6,
          },
        ]);
      }

      if (text.includes("FROM app.chunks c")) {
        return Promise.resolve([
          {
            note_id: "note-semantic",
            title: "Complexity Notes",
            chunk_id: "chunk-semantic",
            chunk_text: "Big O and runtime analysis",
            canvas_course_id: null,
          },
        ]);
      }

      if (text.includes("FROM app.chat_sessions s") && text.includes("MAX(CASE")) {
        return Promise.resolve([
          {
            id: "chat-1",
            title: "Exam prep",
            message_count: 4,
            snippet: "We discussed algorithms and proofs",
          },
        ]);
      }

      return Promise.resolve([]);
    }) as never);
  });

  it("requires authentication", async () => {
    vi.mocked(validateSession).mockResolvedValue(null as never);

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(checkRateLimit).not.toHaveBeenCalled();
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
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(sql).not.toHaveBeenCalled();
    expect(embedText).not.toHaveBeenCalled();
  });

  it("returns the limiter response before searching", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue(
      NextResponse.json({ error: "Too many requests" }, { status: 429 }),
    );

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body).toEqual({ error: "Too many requests" });
    expect(sql).not.toHaveBeenCalled();
    expect(embedText).not.toHaveBeenCalled();
  });

  it("returns destinations for notes, semantic notes, chats, and quizzes", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(checkRateLimit).toHaveBeenCalledWith("global-search", "user-123");
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
    expect(body.results.quizzes).toEqual([
      expect.objectContaining({ id: "216", type: "quiz", source: "keyword", href: "/quiz" }),
      expect.objectContaining({ id: "300", type: "quiz", source: "semantic", href: "/quiz" }),
    ]);
    expect(embedText).toHaveBeenCalledTimes(1);
    expect(embedText).toHaveBeenCalledWith("algorithms");
    expect(searchChunkVectors).toHaveBeenCalledTimes(2);
    expect(searchChunkVectors).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-123",
        excludeDocumentIds: ["note-keyword"],
      }),
    );
    const sqlTexts = (vi.mocked(sql).mock.calls as unknown as SqlCall[]).map(
      ([strings]) => (strings as TemplateStringsArray).join(""),
    );
    expect(
      sqlTexts.some(
        (text) =>
          text.includes("FROM app.chunks c") &&
          text.includes("AND n.user_id = "),
      ),
    ).toBe(true);
    expect(
      sqlTexts.some(
        (text) =>
          text.includes("SELECT DISTINCT n.canvas_course_id") &&
          text.includes("AND n.user_id = "),
      ),
    ).toBe(true);
  });

  it("drops courses the name match already returned before limiting semantic ones", async () => {
    await GET(request());

    const calls = vi.mocked(sql).mock.calls as unknown as SqlCall[];
    const courseScopes = calls
      .filter(([strings]) => strings.join("").startsWith("AND n.canvas_course_id = ANY("))
      .map(([, courseIds]) => courseIds);
    // 216 came back from the name match, so only 300 is looked up
    expect(courseScopes).toEqual([["300"]]);
  });

  it("keeps keyword results when the embedding provider is down", async () => {
    vi.mocked(embedText).mockRejectedValueOnce(new Error("Embedding API 503"));

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results.notes.map((note: { id: string }) => note.id)).toEqual([
      "note-keyword",
    ]);
    expect(body.results.quizzes.map((quiz: { id: string }) => quiz.id)).toEqual([
      "216",
    ]);
    expect(searchChunkVectors).not.toHaveBeenCalled();
  });

  it("runs the keyword queries while the query embedding is in flight", async () => {
    let finishEmbedding: (vector: number[]) => void = () => undefined;
    vi.mocked(embedText).mockReturnValueOnce(
      new Promise((resolve) => {
        finishEmbedding = resolve;
      }),
    );

    const pending = GET(request());
    await vi.waitFor(() => {
      const texts = (vi.mocked(sql).mock.calls as unknown as SqlCall[]).map(
        ([strings]) => strings.join(""),
      );
      expect(texts.some((text) => text.includes("CASE WHEN content IS NOT NULL"))).toBe(true);
      expect(texts.some((text) => text.includes("FROM app.chat_sessions s"))).toBe(true);
    });
    expect(searchChunkVectors).not.toHaveBeenCalled();

    finishEmbedding([0.1, 0.2, 0.3]);
    const response = await pending;
    expect(response.status).toBe(200);
    expect(searchChunkVectors).toHaveBeenCalledTimes(2);
  });
});
