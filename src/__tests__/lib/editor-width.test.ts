import { describe, expect, it } from "vitest";
import {
  DEFAULT_EDITOR_SIZE,
  getEditorSizeFromIndex,
  getEditorWidthIndex,
  getEditorWidthStyle,
  normalizeEditorSize,
} from "@/lib/notes/editor-width";

describe("editor width settings", () => {
  it("keeps every supported width value", () => {
    expect(normalizeEditorSize("large")).toBe("large");
    expect(normalizeEditorSize("full")).toBe("full");
  });

  it("falls back to the default for unknown or retired values", () => {
    expect(DEFAULT_EDITOR_SIZE).toBe("large");
    expect(normalizeEditorSize(undefined)).toBe("large");
    expect(normalizeEditorSize("wide")).toBe("large");
    expect(normalizeEditorSize("small")).toBe("large");
    expect(normalizeEditorSize("medium")).toBe("large");
  });

  it("uses the large width by default", () => {
    expect(getEditorWidthStyle(undefined)).toMatchObject({
      sourceMaxWidth: "62rem",
      previewMaxWidth: "62rem",
    });
  });

  it("removes the max width for full", () => {
    expect(getEditorWidthStyle("full")).toMatchObject({
      sourceMaxWidth: "none",
      previewMaxWidth: "none",
    });
  });

  it("maps slider stops to editor sizes", () => {
    expect(getEditorWidthIndex("large")).toBe(0);
    expect(getEditorWidthIndex("full")).toBe(1);
    expect(getEditorSizeFromIndex("0")).toBe("large");
    expect(getEditorSizeFromIndex("1")).toBe("full");
    expect(getEditorSizeFromIndex("99")).toBe(DEFAULT_EDITOR_SIZE);
  });
});
