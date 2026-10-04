import { describe, expect, it } from "vitest";
import {
  buildFileSpec,
  extractTags,
  inferFileType,
  parseFileDragPayload,
} from "@/lib/notes/utils/file-spec";

const fileTypeCases: ReadonlyArray<
  readonly [string | null | undefined, ReturnType<typeof inferFileType>]
> = [
  ["lecture.pdf", "pdf"],
  ["LECTURE.PDF", "pdf"],
  ...["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "avif"].map(
    (extension) => [`image.${extension}`, "image"] as const,
  ),
  ...["mp4", "webm", "ogg", "mov", "m4v"].map(
    (extension) => [`video.${extension}`, "video"] as const,
  ),
  ["readme.md", "note"],
  ["archive.json", "note"],
  ["Untitled", "note"],
  [null, "note"],
  [undefined, "note"],
];

describe("file type inference", () => {
  it.each(fileTypeCases)("maps %s to %s", (title, expected) => {
    expect(inferFileType(title)).toBe(expected);
  });

  it.each([
    ["application/pdf", "pdf"],
    ["image/png", "image"],
    ["video/mp4", "video"],
  ])("uses persisted MIME type %s when the title has no extension", (mimeType, expected) => {
    expect(inferFileType("Lecture attachment", mimeType)).toBe(expected);
  });
});

describe("file specs", () => {
  it("keeps note content as the editor source", () => {
    expect(
      buildFileSpec({ id: "note-1", title: "My Note", content: "# Hello" }),
    ).toEqual({
      fileId: "note-1",
      fileType: "note",
      title: "My Note",
      sourcePath: "# Hello",
    });
  });

  it("prefers object storage for attachments and falls back to content", () => {
    expect(
      buildFileSpec({
        id: "pdf-1",
        title: "slides.pdf",
        content: "fallback",
        s3Key: "uploads/slides.pdf",
      }).sourcePath,
    ).toBe("uploads/slides.pdf");
    expect(
      buildFileSpec({ id: "pdf-2", title: "slides.pdf", content: "fallback" })
        .sourcePath,
    ).toBe("fallback");
  });

  it("uses attachment metadata for extensionless PDFs", () => {
    expect(
      buildFileSpec({
        id: "pdf-1",
        title: "Lecture slides",
        mimeType: "application/pdf",
        s3Key: "uploads/slides",
      }),
    ).toMatchObject({ fileType: "pdf", sourcePath: "uploads/slides" });
  });
});

describe("file drag payload parsing", () => {
  it("accepts a complete payload produced by the notes sidebar", () => {
    const payload = {
      file: {
        fileId: "note-1",
        fileType: "pdf" as const,
        title: "Lecture.pdf",
        sourcePath: "uploads/lecture.pdf",
      },
      sourcePane: "A" as const,
    };

    expect(parseFileDragPayload(JSON.stringify(payload))).toEqual(payload);
  });

  it.each([
    "",
    "not JSON",
    JSON.stringify(null),
    JSON.stringify({}),
    JSON.stringify({ file: { fileId: "", fileType: "note" } }),
    JSON.stringify({ file: { fileId: "note-1", fileType: "archive" } }),
    JSON.stringify({
      file: { fileId: "note-1", fileType: "note", title: 42 },
    }),
    JSON.stringify({
      file: { fileId: "note-1", fileType: "note" },
      sourcePane: "C",
    }),
  ])("rejects malformed external payload %s", (raw) => {
    expect(parseFileDragPayload(raw)).toBeNull();
  });
});

describe("note tag extraction", () => {
  it("combines frontmatter aliases and inline tags without duplicates", () => {
    const content = [
      "---",
      "keywords: algorithms, data-structures",
      "---",
      "See #algorithms and #TypeScript",
    ].join("\n");

    expect(extractTags(content)).toEqual([
      "algorithms",
      "data-structures",
      "typescript",
    ]);
  });

  it("ignores hashtag-like text in the middle of a token", () => {
    expect(extractTags("c#programming is not a tag")).toEqual([]);
  });

  it.each([null, undefined, ""])("returns no tags for %s", (content) => {
    expect(extractTags(content)).toEqual([]);
  });
});
