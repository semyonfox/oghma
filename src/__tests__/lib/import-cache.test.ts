import { describe, expect, it } from "vitest";
import {
  importedFileStorageKey,
  isReplayableImportedMarkdown,
} from "@/lib/canvas/import-cache";

describe("imported file cache helpers", () => {
  it("uses a hash-stable shared storage key", () => {
    expect(
      importedFileStorageKey(
        "abc123def456",
        "../../Lecture 01 Final!!.PDF",
      ),
    ).toBe("imports/shared/abc123def456.PDF");
  });

  it("allows cached markdown replay when note-local asset URLs are absent", () => {
    expect(
      isReplayableImportedMarkdown("# Notes\n\nPlain text content."),
    ).toBe(true);
  });

  it("blocks cached markdown replay when note-local asset URLs are embedded", () => {
    expect(
      isReplayableImportedMarkdown(
        "![figure](/api/notes/550e8400-e29b-41d4-a716-446655440000/assets?name=page-1.png)",
      ),
    ).toBe(false);
  });
});
