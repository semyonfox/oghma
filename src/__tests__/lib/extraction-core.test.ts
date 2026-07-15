import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const extractWithMarker = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ocr", () => ({ extractWithMarker }));

import { extractContentFromBuffer } from "@/lib/ingestion/extraction-core";

describe("Marker OCR environment toggle", () => {
  beforeEach(() => {
    process.env.MARKER_API_URL = "http://marker.test";
    delete process.env.MARKER_OCR_ENABLED;
    extractWithMarker.mockResolvedValue({
      text: "OCR text",
      chunks: ["OCR text"],
      images: {},
      metadata: null,
      pageRange: null,
    });
  });

  afterEach(() => {
    delete process.env.MARKER_API_URL;
    delete process.env.MARKER_OCR_ENABLED;
    vi.clearAllMocks();
  });

  it("uses configured Marker OCR by default", async () => {
    const result = await extractContentFromBuffer({
      buffer: Buffer.from("document"),
      filename: "lecture.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    expect(extractWithMarker).toHaveBeenCalledOnce();
    expect(result.source).toBe("marker");
  });

  it.each(["false", "0", "off", " FALSE "])(
    "bypasses Marker OCR when MARKER_OCR_ENABLED=%s",
    async (value) => {
      process.env.MARKER_OCR_ENABLED = value;

      const result = await extractContentFromBuffer({
        buffer: Buffer.from("document"),
        filename: "lecture.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });

      expect(extractWithMarker).not.toHaveBeenCalled();
      expect(result.source).toBe("skipped");
    },
  );
});
