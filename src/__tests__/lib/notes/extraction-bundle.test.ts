import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = vi.fn();
  const sql = Object.assign(vi.fn(), {
    begin: vi.fn(async (callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
    ),
  });
  return { sql, tx };
});

vi.mock("@/database/pgsql.js", () => ({ default: mocks.sql }));
vi.mock("@/lib/cache", () => ({
  cacheInvalidate: vi.fn().mockResolvedValue(undefined),
  cacheKeys: {
    treeChildren: vi.fn(
      (userId: string, parentId: string | null) =>
        `tree:${userId}:${parentId ?? "root"}`,
    ),
    treeFull: vi.fn((userId: string) => `tree-full:${userId}`),
    notesList: vi.fn((userId: string) => `notes:${userId}`),
  },
}));

import { cacheInvalidate } from "@/lib/cache";
import {
  extractionBundleTitle,
  findOrCreateExtractionBundle,
  moveNoteToExtractionBundle,
} from "@/lib/notes/extraction-bundle";

function queryText(call: unknown[]): string {
  return (call[0] as TemplateStringsArray).join(" ");
}

describe("extractionBundleTitle", () => {
  it("uses the source basename while keeping child extensions intact", () => {
    expect(extractionBundleTitle("Lecture 03.pdf")).toBe("Lecture 03");
    expect(extractionBundleTitle("archive.final.pdf")).toBe("archive.final");
    expect(extractionBundleTitle("  .pdf  ")).toBe(".pdf");
  });
});

describe("extraction bundles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sql.begin.mockImplementation(
      async (callback: (transaction: typeof mocks.tx) => unknown) =>
        callback(mocks.tx),
    );
  });

  it("creates a bundle below the requested parent atomically", async () => {
    mocks.tx
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const bundleId = await findOrCreateExtractionBundle(
      "user-1",
      "module-1",
      "Lecture 03.pdf",
    );

    expect(bundleId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(mocks.sql.begin).toHaveBeenCalledOnce();
    expect(queryText(mocks.tx.mock.calls[0])).toContain(
      "pg_advisory_xact_lock",
    );
    expect(queryText(mocks.tx.mock.calls[1])).toContain("n.is_folder = true");
    expect(queryText(mocks.tx.mock.calls[2])).toContain("INSERT INTO app.notes");
    expect(queryText(mocks.tx.mock.calls[3])).toContain(
      "INSERT INTO app.tree_items",
    );
    expect(cacheInvalidate).toHaveBeenCalledWith(
      "tree:user-1:module-1",
      expect.stringMatching(/^tree:user-1:[0-9a-f-]{36}$/i),
      "tree-full:user-1",
      "notes:user-1",
    );
  });

  it("reuses a source note's existing matching parent folder", async () => {
    mocks.tx
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          parent_id: "bundle-1",
          parent_title: "Lecture 03",
          parent_is_folder: true,
        },
      ]);

    await expect(
      moveNoteToExtractionBundle("user-1", "pdf-note-1", "Lecture 03.pdf"),
    ).resolves.toBe("bundle-1");

    expect(
      mocks.tx.mock.calls.some((call: unknown[]) =>
        queryText(call).includes("INSERT INTO app.notes"),
      ),
    ).toBe(false);
    expect(
      mocks.tx.mock.calls.some((call: unknown[]) =>
        queryText(call).includes("UPDATE app.tree_items"),
      ),
    ).toBe(false);
  });

  it("creates a bundle and reparents a standalone uploaded PDF", async () => {
    mocks.tx
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          parent_id: null,
          parent_title: null,
          parent_is_folder: null,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const bundleId = await moveNoteToExtractionBundle(
      "user-1",
      "pdf-note-1",
      "Lecture 03.pdf",
    );

    expect(bundleId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(queryText(mocks.tx.mock.calls[5])).toContain(
      "UPDATE app.tree_items",
    );
    expect(cacheInvalidate).toHaveBeenCalledWith(
      "tree:user-1:root",
      expect.stringMatching(/^tree:user-1:[0-9a-f-]{36}$/i),
      "tree-full:user-1",
      "notes:user-1",
    );
  });
});
