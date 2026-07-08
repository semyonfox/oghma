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
    expect(normalizeEditorSize("small")).toBe("small");
    expect(normalizeEditorSize("medium")).toBe("medium");
    expect(normalizeEditorSize("large")).toBe("large");
    expect(normalizeEditorSize("full")).toBe("full");
  });

  it("falls back to the default for unknown values", () => {
    expect(normalizeEditorSize(undefined)).toBe(DEFAULT_EDITOR_SIZE);
    expect(normalizeEditorSize("wide")).toBe(DEFAULT_EDITOR_SIZE);
    expect(DEFAULT_EDITOR_SIZE).toBe("medium");
  });

  it("uses Obsidian-like readable spacing by default", () => {
    expect(getEditorWidthStyle(undefined)).toMatchObject({
      sourceMaxWidth: "72ch",
      previewMaxWidth: "48rem",
    });
  });

  it("makes large and full materially wider than small", () => {
    expect(getEditorWidthStyle("small")).toMatchObject({
      sourceMaxWidth: "58ch",
      previewMaxWidth: "40rem",
    });
    expect(getEditorWidthStyle("large")).toMatchObject({
      sourceMaxWidth: "88ch",
      previewMaxWidth: "62rem",
    });
    expect(getEditorWidthStyle("full")).toMatchObject({
      sourceMaxWidth: "none",
      previewMaxWidth: "none",
    });
  });

  it("maps slider stops to editor sizes", () => {
    expect(getEditorWidthIndex("small")).toBe(0);
    expect(getEditorWidthIndex("medium")).toBe(1);
    expect(getEditorWidthIndex("large")).toBe(2);
    expect(getEditorWidthIndex("full")).toBe(3);
    expect(getEditorSizeFromIndex("0")).toBe("small");
    expect(getEditorSizeFromIndex("1")).toBe("medium");
    expect(getEditorSizeFromIndex("2")).toBe("large");
    expect(getEditorSizeFromIndex("3")).toBe("full");
    expect(getEditorSizeFromIndex("99")).toBe(DEFAULT_EDITOR_SIZE);
  });
});
