import { describe, expect, it } from "vitest";
import { applyTreeView, topLevelAncestor } from "@/lib/notes/tree-view";
import { DEFAULT_TREE_VIEW, readTreeViewSettings } from "@/lib/notes/tree-view-settings";
import { NOTE_DELETED, NOTE_PINNED, NOTE_SHARED, type NOTE_DELETED as Deleted } from "@/lib/notes/types/meta";
import type { CourseState, NoteModel } from "@/lib/notes/types/note";
import type { TreeModel } from "@/lib/notes/types/tree";

function data(id: string, extra: Partial<NoteModel> = {}): NoteModel {
  const deleted: Deleted = NOTE_DELETED.NORMAL;
  return { id, title: id, deleted, shared: NOTE_SHARED.PRIVATE, pinned: NOTE_PINNED.UNPINNED, ...extra };
}

const course = (canvasStatus: CourseState["canvasStatus"]): CourseState => ({
  canvasStatus,
  isCanvasCourse: true,
  override: null,
  academicYear: null,
});

const tree: TreeModel = {
  rootId: "root",
  items: {
    root: { id: "root", children: ["ct213", "ct101", "loose.png"] },
    ct213: { id: "ct213", children: ["slides", "old.md", "new.md", "photo.png"], data: data("ct213", { isFolder: true, course: course("current") }) },
    ct101: { id: "ct101", children: ["notes.md"], data: data("ct101", { isFolder: true, course: course("past") }) },
    slides: { id: "slides", children: [], data: data("slides", { isFolder: true, pid: "ct213", updatedAt: "2026-01-01T00:00:00Z" }) },
    "old.md": { id: "old.md", children: [], data: data("old.md", { pid: "ct213", updatedAt: "2026-02-01T00:00:00Z" }) },
    "new.md": { id: "new.md", children: [], data: data("new.md", { pid: "ct213", updatedAt: "2026-10-01T00:00:00Z" }) },
    "photo.png": { id: "photo.png", children: [], data: data("photo.png", { pid: "ct213", s3Key: "k/photo.png" }) },
    "notes.md": { id: "notes.md", children: [], data: data("notes.md", { pid: "ct101" }) },
    "loose.png": { id: "loose.png", children: [], data: data("loose.png", { s3Key: "k/loose.png" }) },
  },
};

describe("applyTreeView", () => {
  it("folds finished courses into the footer count", () => {
    const view = applyTreeView(tree, DEFAULT_TREE_VIEW, { revealFinished: false, activeId: null });
    expect(view.tree.items.root.children).toEqual(["ct213", "loose.png"]);
    expect(view.hiddenFinished).toEqual(["ct101"]);
  });

  it("keeps a finished course in place while one of its notes is open", () => {
    const view = applyTreeView(tree, DEFAULT_TREE_VIEW, { revealFinished: false, activeId: "notes.md" });
    expect(view.tree.items.root.children).toContain("ct101");
    expect(view.hiddenFinished).toEqual([]);
  });

  it("shows everything once the footer is opened", () => {
    const view = applyTreeView(tree, DEFAULT_TREE_VIEW, { revealFinished: true, activeId: null });
    expect(view.tree.items.root.children).toEqual(["ct213", "ct101", "loose.png"]);
    expect(view.shownFinished).toEqual(["ct101"]);
  });

  it("hides images and other loose files but keeps notes and folders", () => {
    const view = applyTreeView(tree, { ...DEFAULT_TREE_VIEW, showFiles: false }, { revealFinished: false, activeId: null });
    expect(view.tree.items.ct213.children).toEqual(["slides", "old.md", "new.md"]);
    expect(view.tree.items.root.children).toEqual(["ct213"]);
  });

  it("sorts by most recently edited", () => {
    const view = applyTreeView(tree, { ...DEFAULT_TREE_VIEW, sort: "recent" }, { revealFinished: false, activeId: null });
    expect(view.tree.items.ct213.children).toEqual(["new.md", "old.md", "slides", "photo.png"]);
  });

  it("leaves untouched branches as they were", () => {
    const view = applyTreeView(tree, DEFAULT_TREE_VIEW, { revealFinished: false, activeId: null });
    expect(view.tree.items.ct213).toBe(tree.items.ct213);
  });
});

describe("topLevelAncestor", () => {
  it("walks up to the top-level folder", () => {
    expect(topLevelAncestor(tree, "old.md")).toBe("ct213");
    expect(topLevelAncestor(tree, "ct101")).toBe("ct101");
    expect(topLevelAncestor(tree, "missing")).toBeNull();
  });
});

describe("readTreeViewSettings", () => {
  it("fills gaps with defaults and ignores invalid values", () => {
    expect(readTreeViewSettings({ marks: "badge", sort: "sideways" })).toEqual({
      ...DEFAULT_TREE_VIEW,
      marks: "badge",
    });
    expect(readTreeViewSettings(undefined)).toEqual(DEFAULT_TREE_VIEW);
  });
});
