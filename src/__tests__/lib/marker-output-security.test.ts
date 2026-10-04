import { afterEach, describe, expect, it, vi } from "vitest";
import {
  validateMarkerOutput,
  persistMarkerAssetsForNote,
} from "@/lib/marker-output";
import { StoreS3 } from "@/lib/storage/s3";
import { extractWithMarker } from "@/lib/ocr";

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
