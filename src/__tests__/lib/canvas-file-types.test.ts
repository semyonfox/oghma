import { describe, expect, it } from "vitest";
import { PROCESSABLE_TYPES, resolveMimeType } from "@/lib/canvas/file-types";

describe("resolveMimeType", () => {
  // Canvas echoes the uploader's claimed type; storing it would let an
  // imported file render as HTML or SVG on the app origin
  it("never passes an unknown Canvas type through", () => {
    expect(resolveMimeType("slides.html", "text/html")).toBe("application/octet-stream");
    expect(resolveMimeType("diagram.svg", "image/svg+xml")).toBe("application/octet-stream");
    expect(resolveMimeType(undefined, undefined)).toBe("application/octet-stream");
    expect(PROCESSABLE_TYPES.has(resolveMimeType("page.htm", "text/html"))).toBe(false);
  });

  it("keeps a processable Canvas type and falls back to the extension", () => {
    expect(resolveMimeType("notes.bin", "application/pdf")).toBe("application/pdf");
    expect(resolveMimeType("Lecture 1.PDF", "application/octet-stream")).toBe("application/pdf");
    expect(resolveMimeType("week.md", "text/html")).toBe("text/markdown");
  });
});
