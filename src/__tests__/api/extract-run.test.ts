import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/database/pgsql.js", () => ({
  default: vi.fn(() => Promise.resolve([])),
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

import sql from "@/database/pgsql.js";
import { replaceNoteEmbeddings } from "@/lib/rag/indexing";
import { runExtraction } from "@/app/api/extract/route";

type SqlCall = [TemplateStringsArray, ...unknown[]];

describe("runExtraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    const updateCall = (vi.mocked(sql).mock.calls as unknown as SqlCall[]).find(
      ([strings]) =>
        (strings as TemplateStringsArray).join("").includes("extraction_coverage"),
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
});
