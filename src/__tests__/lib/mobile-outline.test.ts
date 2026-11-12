import { describe, expect, it } from "vitest";
import { branchRecency, orderOutline, shortEditedLabel, topicOutline } from "@/lib/notes/mobile-outline";
import type { TagsViewCourse, TagsViewFile } from "@/lib/notes/tags-view";
import type { NoteModel } from "@/lib/notes/types/note";
import type { TreeModel } from "@/lib/notes/types/tree";

function item(id: string, data: Partial<NoteModel> = {}, children: string[] = []) {
  return {
    id,
    children,
    isFolder: data.isFolder,
    data: { id, title: id, deleted: 0, shared: 0, pinned: 0, ...data } as NoteModel,
  };
}

function treeOf(...items: ReturnType<typeof item>[]): TreeModel {
  return {
    rootId: "root",
    items: {
      root: { id: "root", children: items.map((entry) => entry.id) },
      ...Object.fromEntries(items.map((entry) => [entry.id, entry])),
    },
  };
}

const titles = (tree: TreeModel, ids: string[], order: "name" | "recent") =>
  orderOutline(tree, ids, order).map((entry) => entry.data?.title);

describe("course order", () => {
  it("follows canvas module positions over titles", () => {
    const tree = treeOf(
      item("Week 10", { isFolder: true, modulePosition: 1 }),
      item("Introduction", { isFolder: true, modulePosition: 3 }),
      item("Week 2", { isFolder: true, modulePosition: 2 }),
    );
    expect(titles(tree, ["Week 10", "Introduction", "Week 2"], "name")).toEqual(["Week 10", "Week 2", "Introduction"]);
  });

  it("sorts titles with numbers in natural order when nothing has a position", () => {
    const tree = treeOf(item("Week 10", { isFolder: true }), item("Week 2", { isFolder: true }), item("week 1", { isFolder: true }));
    expect(titles(tree, ["Week 10", "Week 2", "week 1"], "name")).toEqual(["week 1", "Week 2", "Week 10"]);
  });

  it("puts canvas modules first, then the user's own folders by title, then files", () => {
    const tree = treeOf(
      item("summary.md"),
      item("Assignments", { isFolder: true }),
      item("Labs", { isFolder: true, modulePosition: 2 }),
      item("My revision", { isFolder: true }),
      item("Lectures", { isFolder: true, modulePosition: 1 }),
      item("Lecture 4", { isFolder: true, bundle: { pdfId: "pdf", noteId: "note" } }),
    );
    expect(
      titles(tree, ["summary.md", "Assignments", "Labs", "My revision", "Lectures", "Lecture 4"], "name"),
    ).toEqual(["Lectures", "Labs", "Assignments", "My revision", "Lecture 4", "summary.md"]);
  });
});

describe("recent order", () => {
  it("uses the last edit and ignores updatedAt, which pins and imports bump", () => {
    const tree = treeOf(
      // pinned and re-imported this morning, last written in spring
      item("pinned.md", { editedAt: "2026-03-01T10:00:00Z", updatedAt: "2026-11-09T09:00:00Z", pinned: 1 }),
      item("imported.pdf", { updatedAt: "2026-11-09T08:00:00Z", s3Key: "k/imported.pdf" }),
      item("written.md", { editedAt: "2026-11-01T10:00:00Z", updatedAt: "2026-11-01T10:00:00Z" }),
    );
    expect(titles(tree, ["pinned.md", "imported.pdf", "written.md"], "recent")).toEqual([
      "written.md",
      "pinned.md",
      "imported.pdf",
    ]);
  });

  it("lifts a folder by its newest descendant and mixes folders with files", () => {
    const tree = treeOf(
      item("CT331", { isFolder: true, editedAt: "2026-01-01T00:00:00Z" }, ["labs"]),
      item("labs", { isFolder: true, pid: "CT331", editedAt: "2026-01-01T00:00:00Z" }, ["lab3.md"]),
      item("lab3.md", { pid: "labs", editedAt: "2026-11-08T12:00:00Z" }),
      item("loose.md", { editedAt: "2026-10-01T00:00:00Z" }),
    );
    expect(branchRecency(tree, "CT331")).toBe(Date.parse("2026-11-08T12:00:00Z"));
    expect(titles(tree, ["loose.md", "CT331"], "recent")).toEqual(["CT331", "loose.md"]);
  });

  it("falls back to course order between notes that were never edited", () => {
    const tree = treeOf(item("Week 10", { isFolder: true, modulePosition: 2 }), item("Week 2", { isFolder: true, modulePosition: 1 }));
    expect(titles(tree, ["Week 10", "Week 2"], "recent")).toEqual(["Week 2", "Week 10"]);
  });
});

describe("topicOutline", () => {
  const file = (id: string, editedAt: string | null = null): TagsViewFile => ({
    id,
    noteId: id,
    title: id,
    path: "",
    rootId: "ct331",
    isFile: false,
    mimeType: null,
    main: false,
    suggested: false,
    kind: null,
    editedAt,
  });
  const course: TagsViewCourse = {
    rootId: "ct331",
    title: "CT331",
    maps: [{ id: "map", name: "CT331" }],
    topics: [
      { mapId: "map", topicId: "lambda", name: "Lambda calculus", topicIndex: 0, files: [file("lecture 3"), file("summary", "2026-11-08T00:00:00Z")], suggestedCount: 0 },
      { mapId: "map", topicId: "lists", name: "Scheme lists", topicIndex: 1, files: [], suggestedCount: 1 },
      { mapId: "map", topicId: "recursion", name: "Recursion", topicIndex: 2, files: [file("summary", "2026-11-08T00:00:00Z"), file("lab 2", "2026-11-09T00:00:00Z")], suggestedCount: 0 },
    ],
    review: [{ ...file("lecture 4"), suggested: true, changed: false, topics: [] }],
    untagged: [file("timetable")],
  };

  it("puts To review first, keeps map order, drops empty topics and ends with untagged files", () => {
    const groups = topicOutline(course, "name");
    expect(groups.map((group) => [group.kind, group.name, group.files.map((entry) => entry.id)])).toEqual([
      ["review", "", ["lecture 4"]],
      ["topic", "Lambda calculus", ["lecture 3", "summary"]],
      ["topic", "Recursion", ["lab 2", "summary"]],
      ["untagged", "", ["timetable"]],
    ]);
  });

  it("lists a note under every topic it belongs to and orders by edits in recent", () => {
    const groups = topicOutline(course, "recent").filter((group) => group.kind === "topic");
    expect(groups.map((group) => [group.name, group.files.map((entry) => entry.id)])).toEqual([
      ["Recursion", ["lab 2", "summary"]],
      ["Lambda calculus", ["summary", "lecture 3"]],
    ]);
  });
});

describe("shortEditedLabel", () => {
  const t = (key: string, values?: Record<string, string | number>) =>
    values ? key.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name])) : key;
  const now = Date.parse("2026-11-09T12:00:00Z");

  it("reads as minutes, hours, then a day", () => {
    expect(shortEditedLabel(0, now, "en", t)).toBeNull();
    expect(shortEditedLabel(now - 20_000, now, "en", t)).toBe("now");
    expect(shortEditedLabel(now - 12 * 60_000, now, "en", t)).toBe("12m");
    expect(shortEditedLabel(now - 4 * 3_600_000, now, "en", t)).toBe("4h");
    expect(shortEditedLabel(Date.parse("2026-11-07T12:00:00Z"), now, "en-GB", t)).toBe("Sat");
    expect(shortEditedLabel(Date.parse("2026-10-12T12:00:00Z"), now, "en-GB", t)).toBe("12 Oct");
  });
});
