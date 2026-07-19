import { describe, expect, it } from "vitest";
import {
  importedFileStorageKey,
  canvasFileSource,
  isReplayableImportedMarkdown,
  isSharedImportedFileKey,
  sha256Hex,
} from "@/lib/canvas/import-cache";

describe("imported file cache identity", () => {
  it("uses the bytes, not course or filename, as identity", () => {
    expect(sha256Hex(Buffer.from("same PDF"))).toBe(
      sha256Hex(Buffer.from("same PDF")),
    );
    expect(sha256Hex(Buffer.from("same PDF"))).not.toBe(
      sha256Hex(Buffer.from("changed PDF")),
    );
  });

  it("creates a stable shared object key across renamed files", () => {
    const hash = "abc123";
    expect(importedFileStorageKey(hash, "../Lecture One.PDF"))
      .toBe("imports/shared/abc123.pdf");
    expect(isSharedImportedFileKey("imports/shared/abc123.pdf")).toBe(true);
    expect(isSharedImportedFileKey("canvas/user/course/file.pdf")).toBe(false);
  });

  it("accepts Marker markdown because asset URLs are canonicalized on capture", () => {
    expect(isReplayableImportedMarkdown("# Safe extracted text")).toBe(true);
    expect(isReplayableImportedMarkdown(
      "![](/api/notes/550e8400-e29b-41d4-a716-446655440000/assets?name=p1.png)",
    )).toBe(true);
  });

  it("builds a tenant-scoped Canvas locator only with versioned metadata", () => {
    expect(canvasFileSource({
      baseUrl: "https://University.Instructure.com/api/v1",
      mimeType: "application/pdf",
      file: { id: 42, updated_at: "2026-07-17T10:00:00Z", size: 1234,
        display_name: "irrelevant.pdf" },
    })).toEqual({
      tenant: "university.instructure.com",
      externalFileId: "42",
      versionToken: "2026-07-17T10:00:00Z",
      fileSize: 1234,
      mimeType: "application/pdf",
    });
    expect(canvasFileSource({
      baseUrl: "https://university.instructure.com/api/v1",
      mimeType: "application/pdf",
      file: { id: 42, size: 1234 },
    })).toBeNull();
  });
});
