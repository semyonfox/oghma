import { describe, expect, it, vi } from "vitest";
import {
  normalizeMarkerMarkdown,
  persistMarkerAssetsForNote,
  sanitizeMarkerAssetName,
} from "@/lib/marker-output";

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

  it("sanitizes marker asset names", () => {
    expect(sanitizeMarkerAssetName("_page_1_Picture_2.jpeg")).toBe(
      "_page_1_Picture_2.jpeg",
    );
    expect(sanitizeMarkerAssetName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeMarkerAssetName("   ")).toBeNull();
  });

  it("stores images and rewrites markdown links", async () => {
    const putObject = vi.fn().mockResolvedValue(undefined);
    const storage = { putObject } as any;

    const result = await persistMarkerAssetsForNote({
      storage,
      userId: "u1",
      noteId: "n1",
      markdown: "![](_page_0_Picture_3.jpeg)",
      images: { _page_0_Picture_3.jpeg: "YWJj" },
      metadata: { pages: 1 },
    });

    expect(result.imageCount).toBe(1);
    expect(result.markdown).toContain(
      "/api/notes/n1/assets?name=_page_0_Picture_3.jpeg",
    );
    expect(putObject).toHaveBeenCalledTimes(2); // image + metadata
  });
});
