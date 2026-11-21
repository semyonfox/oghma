import { afterEach, describe, expect, it, vi } from "vitest";
import {
  markerAssetPrefix,
  normalizeMarkerMarkdown,
  persistMarkerAssetsForNote,
  sanitizeMarkerAssetName,
  validateMarkerOutput,
} from "@/lib/marker/output";
import { extractWithMarker } from "@/lib/marker/ocr";
import { StoreS3 } from "@/lib/storage/s3";

describe("marker-output", () => {
  it("normalizes marker page anchors and separators", () => {
    const input = [
      '### <span id="page-0-0"></span>Title',
      "",
      "{1}------------------------------------------------",
      "",
      "Body",
    ].join("\n");

    expect(normalizeMarkerMarkdown(input)).toBe("### Title\n\nBody");
  });

  it("removes Marker page-count lines from imported Markdown", () => {
    const input = [
      "# QUIZ CT2108",
      "",
      "\\-- 1 of 11 --",
      "",
      "1. Which command displays the ARP cache?",
      "",
      "-- 2 of 11 --",
      "",
      "2. What is ARP for?",
    ].join("\n");

    expect(normalizeMarkerMarkdown(input)).toBe(
      "# QUIZ CT2108\n\n1. Which command displays the ARP cache?\n\n2. What is ARP for?",
    );
  });

  it("sanitizes marker asset names", () => {
    expect(sanitizeMarkerAssetName("_page_1_Picture_2.jpeg")).toBe(
      "_page_1_Picture_2.jpeg",
    );
    expect(sanitizeMarkerAssetName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeMarkerAssetName("   ")).toBeNull();
  });

  it("uses one narrow namespace per note for Marker assets", () => {
    expect(markerAssetPrefix("user-1", "note-1")).toBe(
      "marker/user-1/note-1/",
    );
  });

  it("stores images and rewrites markdown links", async () => {
    const storage = new StoreS3({
      bucket: "synthetic",
      prefix: "test",
      accessKey: "synthetic",
      secretKey: "synthetic",
    });
    const objects = new Map<string, unknown>();
    vi.spyOn(storage, "putObject").mockImplementation(async (key, body) => {
      objects.set(key, body);
    });

    const result = await persistMarkerAssetsForNote({
      storage,
      userId: "u1",
      noteId: "n1",
      markdown: "![](_page_0_Picture_3.jpeg)",
      images: { "_page_0_Picture_3.jpeg": "YWJj" },
      metadata: { pages: 1 },
    });

    expect(result.imageCount).toBe(1);
    expect(result.markdown).toContain(
      "/api/notes/n1/assets?name=_page_0_Picture_3.jpeg",
    );
    expect(objects.get("marker/u1/n1/_page_0_Picture_3.jpeg")).toEqual(
      Buffer.from("abc"),
    );
    expect(objects.get("marker/u1/n1/_metadata.json")).toBe('{"pages":1}');
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const output = { output: "# Synthetic", images: {}, metadata: null };

describe("Marker boundary validation", () => {
  it("rejects invalid shapes and UTF-8 output exceeding the cap", () => {
    vi.stubEnv("MARKER_MAX_RESULT_OUTPUT_BYTES", "16");
    for (const value of [
      null,
      { output: [] },
      { ...output, output: "é".repeat(9) },
      { ...output, images: [] },
    ]) {
      expect(() => validateMarkerOutput(value)).toThrow();
    }
  });
  it("checks count and decoded size before decoding base64", () => {
    vi.stubEnv("MARKER_MAX_RESULT_IMAGES", "1");
    vi.stubEnv("MARKER_MAX_RESULT_IMAGE_BYTES", "2");
    expect(() =>
      validateMarkerOutput({ ...output, images: { "x.png": "AAAA" } }),
    ).toThrow("per-image");
    expect(() =>
      validateMarkerOutput({
        ...output,
        images: { "x.png": "YQ==", "y.png": "YQ==" },
      }),
    ).toThrow("count");
    vi.stubEnv("MARKER_MAX_RESULT_IMAGES", "2");
    vi.stubEnv("MARKER_MAX_RESULT_IMAGE_TOTAL_BYTES", "1");
    expect(() =>
      validateMarkerOutput({
        ...output,
        images: { "x.png": "YQ==", "y.png": "YQ==" },
      }),
    ).toThrow("aggregate");
    expect(() =>
      validateMarkerOutput({ ...output, images: { "x.png": "YR==" } }),
    ).toThrow("canonical");
  });
  it("bounds escaped metadata and rejects cyclic structures", () => {
    vi.stubEnv("MARKER_MAX_RESULT_METADATA_BYTES", "20");
    expect(() =>
      validateMarkerOutput({ ...output, metadata: "\u0000".repeat(4) }),
    ).toThrow("size");
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => validateMarkerOutput({ ...output, metadata: cycle })).toThrow(
      "cycle",
    );
  });
  it("validates every asset before any write", async () => {
    const storage = new StoreS3({
      bucket: "synthetic",
      prefix: "test",
      accessKey: "synthetic",
      secretKey: "synthetic",
    });
    const write = vi.spyOn(storage, "putObject").mockResolvedValue(undefined);
    await expect(
      persistMarkerAssetsForNote({
        storage,
        userId: "synthetic",
        noteId: "synthetic",
        markdown: "# Test",
        images: { "bad.png": "!" },
      }),
    ).rejects.toThrow();
    expect(write).not.toHaveBeenCalled();
  });
  it("caps direct converter bytes before parsing a chunked response", async () => {
    vi.stubEnv("MARKER_API_URL", "https://converter.example.test");
    vi.stubEnv("MARKER_MAX_RESULT_BYTES", "16");
    const cancel = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new TextEncoder().encode("x".repeat(17)));
            },
            cancel,
          }),
        ),
      ),
    );
    await expect(
      extractWithMarker(Buffer.from("synthetic"), "a.pdf"),
    ).rejects.toThrow("exceeds");
    expect(cancel).toHaveBeenCalledOnce();
  });
});
