import { beforeEach, describe, expect, it, vi } from "vitest";

const { sqlMock } = vi.hoisted(() => ({
  sqlMock: vi.fn(
    async (_strings: TemplateStringsArray, ..._values: unknown[]): Promise<Record<string, unknown>[]> => [],
  ),
}));

vi.mock("@/database/pgsql", () => ({
  default: sqlMock,
}));

vi.mock("@/lib/rag/indexing", () => ({
  replaceNoteEmbeddings: vi.fn().mockResolvedValue(2),
}));

vi.mock("@/lib/strip-markdown", () => ({
  stripMarkdown: vi.fn((value: string) => value.replace(/[#*`]/g, "")),
}));

vi.mock("@/lib/ingestion/extraction-core", () => ({
  extractContentFromBuffer: vi.fn().mockResolvedValue({
    rawText: "# Marker text",
    chunks: ["Marker text", "Diagram text"],
    source: "marker",
    pageRange: "1-10",
    markerImages: {},
    markerMetadata: null,
  }),
}));

vi.mock("@/lib/storage/init", () => ({
  getStorageProvider: vi.fn(() => ({
    getSignUrl: vi.fn().mockResolvedValue("https://storage.example/doc.pdf"),
  })),
}));

vi.mock("@/lib/xray", () => ({
  xraySubsegment: vi.fn((_name: string, fn: () => unknown) => fn()),
}));

vi.mock("@/lib/canvas/extraction-retry", () => ({
  enqueueExtractionRetry: vi.fn(),
}));

vi.mock("@/lib/marker-output", () => ({
  persistMarkerAssetsForNote: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({
  validateSession: vi.fn(),
}));

vi.mock("@/lib/rateLimiter", () => ({
  checkRateLimit: vi.fn(),
}));

import { replaceNoteEmbeddings } from "@/lib/rag/indexing";
import { NextRequest } from "next/server";
import { validateSession } from "@/lib/auth";
import { POST, runExtraction } from "@/app/api/extract/route";

describe("runExtraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sqlMock.mockReset();
    sqlMock
      .mockResolvedValueOnce([{ note_id: "00000000-0000-0000-0000-000000000001" }])
      .mockResolvedValueOnce([{ note_id: "00000000-0000-0000-0000-000000000001" }]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: vi.fn(() => "1024") },
        arrayBuffer: vi.fn(async () => Buffer.from("pdf bytes").buffer),
      }),
    );
  });

  it("stores extraction coverage for page-limited Marker output", async () => {
    await expect(
      runExtraction(
        "00000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-000000000002",
        "uploads/doc.pdf",
        "application/pdf",
      ),
    ).resolves.toEqual({ chunksStored: 2 });

    const updateCall = sqlMock.mock.calls.find(([strings]) =>
      strings.join("").includes("extraction_coverage"),
    );

    expect(updateCall).toBeDefined();
    const coverageValue = updateCall?.find(
      (value) => typeof value === "string" && value.includes('"page_range"'),
    );
    expect(JSON.parse(String(coverageValue))).toEqual(
      expect.objectContaining({
        source: "marker",
        page_range: "1-10",
        partial: true,
      }),
    );
    expect(replaceNoteEmbeddings).toHaveBeenCalledWith(
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
      ["Marker text", "Diagram text"],
    );
  });

  it("does not fetch or publish an extraction for a note already in Trash", async () => {
    sqlMock.mockReset();
    sqlMock.mockResolvedValueOnce([]);

    await expect(
      runExtraction(
        "00000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-000000000002",
        "uploads/doc.pdf",
        "application/pdf",
      ),
    ).resolves.toEqual({ chunksStored: 0 });

    expect(fetch).not.toHaveBeenCalled();
    expect(replaceNoteEmbeddings).not.toHaveBeenCalled();
  });
});

describe("POST /api/extract", () => {
  const userId = "00000000-0000-0000-0000-000000000002";
  const documentId = "00000000-0000-0000-0000-000000000001";
  const sourceKey = "notes/00000000-0000-0000-0000-000000000003/private.pdf";

  function request(body: unknown) {
    return new NextRequest("http://localhost/api/extract", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    sqlMock.mockReset();
    vi.mocked(validateSession).mockResolvedValue({ user_id: userId, email: "reader@example.com" });
  });

  it("rejects a source key without an active note or attachment owned by the caller", async () => {
    sqlMock
      .mockResolvedValueOnce([{ note_id: documentId }])
      .mockResolvedValueOnce([]);
    vi.stubGlobal("fetch", vi.fn());

    const response = await POST(request({
      documentId,
      url: `https://example.com/${sourceKey}`,
    }));

    expect(response.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a trashed destination note before accessing storage", async () => {
    sqlMock.mockResolvedValueOnce([]);
    vi.stubGlobal("fetch", vi.fn());

    const response = await POST(request({
      documentId,
      url: `https://example.com/${sourceKey}`,
    }));

    expect(response.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("extracts an owned source file into an active note", async () => {
    sqlMock
      .mockResolvedValueOnce([{ note_id: documentId }])
      .mockResolvedValueOnce([{ note_id: "00000000-0000-0000-0000-000000000003" }])
      .mockResolvedValueOnce([{ note_id: documentId }])
      .mockResolvedValueOnce([{ note_id: documentId }]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: vi.fn(() => "9") },
      arrayBuffer: vi.fn(async () => Buffer.from("pdf bytes").buffer),
    }));

    const response = await POST(request({
      documentId,
      url: `https://example.com/${sourceKey}`,
    }));

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
    const queries = sqlMock.mock.calls.map(([strings]) => strings.join(""));
    expect(queries[0]).toContain("deleted_at IS NULL");
    expect(queries[1]).toContain("app.attachments");
    expect(queries[1]).toContain("attachment.user_id = source.user_id");
  });

  it("returns 400 for malformed request shapes", async () => {
    for (const body of [null, [], { documentId: "bad", url: `https://example.com/${sourceKey}` }, { documentId, url: 42 }]) {
      const response = await POST(request(body));
      expect(response.status).toBe(400);
    }
    const invalidJson = new NextRequest("http://localhost/api/extract", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    expect((await POST(invalidJson)).status).toBe(400);
    expect(sqlMock).not.toHaveBeenCalled();
  });
});
