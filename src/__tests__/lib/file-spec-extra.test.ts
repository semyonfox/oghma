import { describe, expect, it } from "vitest";
import {
  buildFileSpec,
  extractTags,
  inferFileType,
} from "@/lib/notes/utils/file-spec";

// ─── inferFileType ───────────────────────────────────────────────────────────

describe("inferFileType", () => {
  it("detects pdf extension", () => {
    expect(inferFileType("lecture.pdf")).toBe("pdf");
    expect(inferFileType("LECTURE.PDF")).toBe("pdf");
  });

  it("detects image extensions", () => {
    for (const ext of [
      "png",
      "jpg",
      "jpeg",
      "gif",
      "svg",
      "webp",
      "bmp",
      "avif",
    ]) {
      expect(inferFileType(`image.${ext}`)).toBe("image");
    }
  });

  it("detects video extensions", () => {
    for (const ext of ["mp4", "webm", "ogg", "mov", "m4v"]) {
      expect(inferFileType(`video.${ext}`)).toBe("video");
    }
  });

  it("defaults to note for plain title", () => {
    expect(inferFileType("my notes")).toBe("note");
    expect(inferFileType("readme.md")).toBe("note");
    expect(inferFileType("")).toBe("note");
    expect(inferFileType(null)).toBe("note");
    expect(inferFileType(undefined)).toBe("note");
  });
});

// ─── buildFileSpec ───────────────────────────────────────────────────────────

describe("buildFileSpec", () => {
  it("builds a note spec from id and title", () => {
    const spec = buildFileSpec({
      id: "uuid-1",
      title: "My Note",
      content: "# Hello",
    });
    expect(spec).toMatchObject({
      fileId: "uuid-1",
      fileType: "note",
      title: "My Note",
    });
    expect(spec.sourcePath).toBe("# Hello");
  });

  it("uses s3Key as sourcePath for PDFs", () => {
    const spec = buildFileSpec({
      id: "uuid-2",
      title: "slides.pdf",
      s3Key: "s3://bucket/slides.pdf",
    });
    expect(spec.fileType).toBe("pdf");
    expect(spec.sourcePath).toBe("s3://bucket/slides.pdf");
  });

  it("falls back to content when s3Key is absent for PDFs", () => {
    const spec = buildFileSpec({
      id: "uuid-3",
      title: "doc.pdf",
      content: "raw-bytes",
    });
    expect(spec.sourcePath).toBe("raw-bytes");
  });

  it("returns empty string fileId when id is omitted", () => {
    const spec = buildFileSpec({ title: "Untitled" });
    expect(spec.fileId).toBe("");
  });
});

// ─── extractTags ─────────────────────────────────────────────────────────────

describe("extractTags", () => {
  it("returns empty array for empty/null content", () => {
    expect(extractTags("")).toEqual([]);
    expect(extractTags(null)).toEqual([]);
    expect(extractTags(undefined)).toEqual([]);
  });

  it("extracts inline hashtags", () => {
    const tags = extractTags(
      "Some content #algorithms and #data-structures here",
    );
    expect(tags).toContain("algorithms");
    expect(tags).toContain("data-structures");
  });

  it("extracts tags from frontmatter tags field", () => {
    const content = "---\ntags: algorithms, data-structures\n---\nBody";
    const tags = extractTags(content);
    expect(tags).toContain("algorithms");
    expect(tags).toContain("data-structures");
  });

  it("deduplicates tags from both sources", () => {
    const content = "---\ntags: algorithms\n---\nSee #algorithms";
    const tags = extractTags(content);
    expect(tags.filter((t) => t === "algorithms")).toHaveLength(1);
  });

  it("ignores hashtag-like things mid-word (no preceding whitespace)", () => {
    // "c#" should not be extracted because # is mid-token, not preceded by space
    const tags = extractTags("c#programming is fun");
    expect(tags).not.toContain("programming");
  });
});
