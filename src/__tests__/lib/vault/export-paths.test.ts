import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/database/pgsql", () => ({ default: vi.fn() }));

import sql from "@/database/pgsql";
import { buildExportPathMap } from "@/lib/vault/tree-builder";

interface Row {
  note_id: string;
  parent_id: string | null;
  title: string | null;
  s3_key: string | null;
  is_folder: boolean;
}

function row(note_id: string, title: string | null, overrides: Partial<Row> = {}): Row {
  return { note_id, parent_id: null, title, s3_key: null, is_folder: false, ...overrides };
}

async function exportPaths(rows: Row[]) {
  vi.mocked(sql).mockResolvedValueOnce(rows as never);
  return buildExportPathMap("user-1");
}

describe("buildExportPathMap", () => {
  beforeEach(() => {
    vi.mocked(sql).mockReset();
  });

  it("never loads note bodies up front", async () => {
    await exportPaths([]);
    const [strings] = vi.mocked(sql).mock.calls[0];
    expect((strings as unknown as string[]).join("")).not.toContain("content");
  });

  it("gives same-titled siblings distinct paths, case-insensitively", async () => {
    const entries = await exportPaths([
      row("a", "Notes"),
      row("b", "Notes"),
      row("c", "notes"),
      row("d", "lecture.pdf", { s3_key: "files/one.pdf" }),
      row("e", "lecture.pdf", { s3_key: "files/two.pdf" }),
    ]);

    expect(entries.map((entry) => entry.path)).toEqual([
      "Notes.md",
      "Notes (2).md",
      "notes (3).md",
      "lecture.pdf",
      "lecture (2).pdf",
    ]);
  });

  it("keeps same-named sibling folders apart instead of merging them", async () => {
    const entries = await exportPaths([
      row("f1", "Week 1", { is_folder: true }),
      row("f2", "Week 1", { is_folder: true }),
      row("n1", "a", { parent_id: "f1" }),
      row("n2", "a", { parent_id: "f2" }),
    ]);

    expect(entries.map((entry) => entry.path)).toEqual(["Week 1/a.md", "Week 1 (2)/a.md"]);
  });

  it("keeps each title a single safe path segment", async () => {
    const entries = await exportPaths([
      row("a", "2024/25 plan"),
      row("b", ".."),
      row("c", ""),
      row("d", "tab\there"),
    ]);

    expect(entries.map((entry) => entry.path)).toEqual([
      "2024_25 plan.md",
      "Untitled.md",
      "Untitled (2).md",
      "tab_here.md",
    ]);
  });

  it("exports edited text from content even when the original upload is kept", async () => {
    const entries = await exportPaths([
      row("md", "notes.md", { s3_key: "vault/u/j/k/notes.md" }),
      row("pdf", "slides.pdf", { s3_key: "vault/u/j/k/slides.pdf" }),
    ]);

    expect(entries).toEqual([
      { path: "notes.md", source: { kind: "content", noteId: "md" } },
      { path: "slides.pdf", source: { kind: "object", s3Key: "vault/u/j/k/slides.pdf" } },
    ]);
  });

  it("restores the file extension of a renamed upload and only adds .md to text notes", async () => {
    const entries = await exportPaths([
      row("a", "Lecture 1", { s3_key: "files/abc.pdf" }),
      row("b", "Chapter 1.2"),
      row("c", "todo.txt"),
    ]);

    expect(entries.map((entry) => entry.path)).toEqual([
      "Lecture 1.pdf",
      "Chapter 1.2.md",
      "todo.txt",
    ]);
  });

  it("places notes with missing parents or parent cycles at the root rather than dropping them", async () => {
    const entries = await exportPaths([
      row("orphan", "orphan", { parent_id: "trashed-folder" }),
      row("x", "loop-a", { parent_id: "y" }),
      row("y", "loop-b", { parent_id: "x" }),
    ]);

    const paths = entries.map((entry) => entry.path).sort();
    expect(paths).toHaveLength(3);
    expect(paths).toContain("orphan.md");
    expect(paths.every((path) => !path.startsWith("/"))).toBe(true);
  });
});
