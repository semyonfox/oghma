import { describe, expect, it, vi } from "vitest";
import {
  markerAssetPrefix,
  normalizeMarkerMarkdown,
  persistMarkerAssetsForNote,
  sanitizeMarkerAssetName,
} from "@/lib/marker-output";
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
    const putObject = vi.fn().mockResolvedValue(undefined);
    const storage = Object.assign(Object.create(StoreS3.prototype) as StoreS3, {
      putObject,
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
    expect(putObject).toHaveBeenCalledTimes(2); // image + metadata
  });
});
