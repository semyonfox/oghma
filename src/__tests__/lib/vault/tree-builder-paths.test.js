import { describe, expect, it, vi } from "vitest";

vi.mock("@/database/pgsql.js", () => ({
  default: vi.fn(),
}));

vi.mock("@/lib/notes/storage/pg-tree.js", () => ({
  addNoteToTree: vi.fn(),
}));

import { sanitizePath, shouldIgnore } from "@/lib/vault/tree-builder.js";

describe("shouldIgnore", () => {
  it("ignores known metadata/system files", () => {
    expect(shouldIgnore("__MACOSX/folder/file.md")).toBe(true);
    expect(shouldIgnore("notes/.DS_Store")).toBe(true);
    expect(shouldIgnore("assets/Thumbs.db")).toBe(true);
    expect(shouldIgnore("project/node_modules/pkg/index.js")).toBe(true);
  });

  it("handles windows path separators", () => {
    expect(shouldIgnore("project\\__MACOSX\\foo.txt")).toBe(true);
  });

  it("keeps normal user files", () => {
    expect(shouldIgnore("lectures/week1/notes.md")).toBe(false);
    expect(shouldIgnore("folder/subfolder/file.pdf")).toBe(false);
  });
});

describe("sanitizePath", () => {
  it("normalizes separators and strips leading ./", () => {
    expect(sanitizePath("./folder\\sub/file.md")).toBe("folder/sub/file.md");
  });

  it("rejects traversal attempts", () => {
    expect(sanitizePath("../secrets.txt")).toBeNull();
    expect(sanitizePath("folder/../../secrets.txt")).toBeNull();
    expect(sanitizePath("folder/../secrets.txt")).toBeNull();
  });

  it("rejects absolute paths", () => {
    expect(sanitizePath("/etc/passwd")).toBeNull();
    expect(sanitizePath("C:/Windows/System32/drivers/etc/hosts")).toBeNull();
  });

  it("returns null for empty sanitized path", () => {
    expect(sanitizePath("./")).toBeNull();
    expect(sanitizePath("/")).toBeNull();
  });
});
