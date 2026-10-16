import { describe, expect, it, vi } from "vitest";

vi.mock("@/database/pgsql", () => ({
  default: vi.fn(),
}));

vi.mock("@/lib/notes/storage/pg-tree", () => ({
  addNoteToTree: vi.fn(),
}));

import { sanitizePath, shouldIgnore } from "@/lib/vault/tree-builder";

describe("shouldIgnore", () => {
  it("ignores known metadata/system files", () => {
    expect(shouldIgnore("__MACOSX/folder/file.md")).toBe(true);
    expect(shouldIgnore("notes/.DS_Store")).toBe(true);
    expect(shouldIgnore("assets/Thumbs.db")).toBe(true);
    expect(shouldIgnore("project/node_modules/pkg/index.js")).toBe(true);
    expect(shouldIgnore("vault/.obsidian/workspace.json")).toBe(true);
  });

  it("handles windows path separators", () => {
    expect(shouldIgnore("project\\__MACOSX\\foo.txt")).toBe(true);
  });

  it("keeps normal user files", () => {
    expect(shouldIgnore("lectures/week1/notes.md")).toBe(false);
    expect(shouldIgnore("folder/subfolder/file.pdf")).toBe(false);
  });

  it("ignores leaked Office internals only at the archive root", () => {
    expect(shouldIgnore("word/document.xml")).toBe(true);
    expect(shouldIgnore("ppt/slides/slide1.xml")).toBe(true);
    expect(shouldIgnore("[Content_Types].xml")).toBe(true);
    // user folders that merely end in or contain those names must still import
    expect(shouldIgnore("Crossword/answers.md")).toBe(false);
    expect(shouldIgnore("Keyword/notes.md")).toBe(false);
    expect(shouldIgnore("English/word/vocab.md")).toBe(false);
  });
});

describe("sanitizePath", () => {
  it("normalizes separators and strips leading ./", () => {
    expect(sanitizePath("./folder\\sub/file.md")).toBe("folder/sub/file.md");
  });

  it("drops empty and dot segments rather than creating untitled folders", () => {
    expect(sanitizePath("folder//sub/./file.md")).toBe("folder/sub/file.md");
  });

  it("keeps dot-prefixed names intact", () => {
    expect(sanitizePath(".hidden/notes.md")).toBe(".hidden/notes.md");
  });

  it("rejects traversal attempts", () => {
    expect(sanitizePath("../secrets.txt")).toBeNull();
    expect(sanitizePath("folder/../../secrets.txt")).toBeNull();
    expect(sanitizePath("folder/../secrets.txt")).toBeNull();
    expect(sanitizePath("folder/..")).toBeNull();
    expect(sanitizePath("folder\\..\\secrets.txt")).toBeNull();
  });

  it("rejects absolute paths", () => {
    expect(sanitizePath("/etc/passwd")).toBeNull();
    expect(sanitizePath("C:/Windows/System32/drivers/etc/hosts")).toBeNull();
    expect(sanitizePath("C:relative.txt")).toBeNull();
  });

  it("rejects control characters and absurd nesting", () => {
    expect(sanitizePath("notes\u0000.md")).toBeNull();
    expect(sanitizePath("notes\n.md")).toBeNull();
    expect(sanitizePath(`${"a/".repeat(32)}file.md`)).toBeNull();
    expect(sanitizePath(`${"a/".repeat(31)}file.md`)).not.toBeNull();
    expect(sanitizePath(`${"x".repeat(256)}.md`)).toBeNull();
  });

  it("returns null for empty sanitized path", () => {
    expect(sanitizePath("./")).toBeNull();
    expect(sanitizePath("/")).toBeNull();
  });
});
