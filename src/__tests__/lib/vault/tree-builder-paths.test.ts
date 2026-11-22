import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/database/pgsql.js", () => {
  const sqlMock = vi.fn();
  Object.assign(sqlMock, { begin: vi.fn(
    async (callback: (tx: typeof sqlMock) => unknown) => callback(sqlMock),
  ) });
  return { default: sqlMock, afterDatabaseCommit: (effect: () => Promise<void>) => effect() };
});

vi.mock("uuid", () => ({
  v4: vi.fn(() => "11111111-1111-4111-8111-111111111111"),
}));

import sql from "@/database/pgsql";
import {
  findOrCreateVaultFolder,
  sanitizePath,
  shouldIgnore,
  VaultImportCancelledError,
} from "@/lib/vault/tree-builder";

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

  it("keeps user paths that also occur in Office archives", () => {
    expect(shouldIgnore("word/Revision.md")).toBe(false);
    expect(shouldIgnore("ppt/slides/slide1.xml")).toBe(false);
    expect(shouldIgnore("[Content_Types].xml")).toBe(false);
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

const userId = "22222222-2222-4222-8222-222222222222";
const jobId = "33333333-3333-4333-8333-333333333333";

describe("vault tree lifecycle fence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sql).mockReset();
    vi.mocked(sql).mockResolvedValue([] as never);
  });

  it("does not create folders for a cancelled Vault import", async () => {
    vi.mocked(sql)
      .mockResolvedValueOnce([] as never) // advisory lock
      .mockResolvedValueOnce([] as never); // no active job

    await expect(
      findOrCreateVaultFolder(userId, "Course", null, jobId),
    ).rejects.toBeInstanceOf(VaultImportCancelledError);
  });

  it("creates a folder only while its Vault import remains active", async () => {
    vi.mocked(sql)
      .mockResolvedValueOnce([] as never) // advisory lock
      .mockResolvedValueOnce([{ id: jobId }] as never) // active job
      .mockResolvedValueOnce([] as never) // no existing folder
      .mockResolvedValueOnce([] as never) // note insert
      .mockResolvedValueOnce([] as never); // tree insert

    await expect(
      findOrCreateVaultFolder(userId, "Course", null, jobId),
    ).resolves.toBe("11111111-1111-4111-8111-111111111111");
  });
});
