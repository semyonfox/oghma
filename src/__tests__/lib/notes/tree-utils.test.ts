import { describe, expect, it } from "vitest";
import { NOTE_PINNED } from "@/lib/notes/types/meta";
import { ROOT_ID, TreeModel } from "@/lib/notes/types/tree";
import { buildPinnedTree } from "@/lib/notes/state/tree-utils";

function note(id: string, pinned = NOTE_PINNED.UNPINNED, pid?: string) {
  return {
    id,
    title: id,
    deleted: 0,
    shared: 0,
    pinned,
    pid,
  };
}

describe("buildPinnedTree", () => {
  it("keeps pinned notes and their ancestor path only", () => {
    const tree: TreeModel = {
      rootId: ROOT_ID,
      items: {
        [ROOT_ID]: { id: ROOT_ID, children: ["folder", "loose"] },
        folder: {
          id: "folder",
          children: ["pinned", "unpinned"],
          data: note("folder"),
        },
        pinned: {
          id: "pinned",
          children: [],
          data: note("pinned", NOTE_PINNED.PINNED, "folder"),
        },
        unpinned: {
          id: "unpinned",
          children: [],
          data: note("unpinned", NOTE_PINNED.UNPINNED, "folder"),
        },
        loose: {
          id: "loose",
          children: [],
          data: note("loose"),
        },
      },
    };

    const pinnedTree = buildPinnedTree(tree);

    expect(new Set(Object.keys(pinnedTree.items))).toEqual(
      new Set([ROOT_ID, "folder", "pinned"]),
    );
    expect(pinnedTree.items[ROOT_ID].children).toEqual(["folder"]);
    expect(pinnedTree.items.folder.children).toEqual(["pinned"]);
  });

  it("returns an empty root when no loaded notes are pinned", () => {
    const tree: TreeModel = {
      rootId: ROOT_ID,
      items: {
        [ROOT_ID]: { id: ROOT_ID, children: ["note"] },
        note: { id: "note", children: [], data: note("note") },
      },
    };

    expect(buildPinnedTree(tree).items[ROOT_ID].children).toEqual([]);
  });
});
