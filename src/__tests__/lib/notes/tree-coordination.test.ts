import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyTree, DEFAULT_TREE, type TreeItemSummary, type TreeMoveResult } from "@/lib/notes/types/tree";
import useNoteTreeStore from "@/lib/notes/state/tree";

vi.mock("@/lib/notes/workspace-invalidation", () => ({ publishWorkspaceInvalidation: vi.fn() }));

type Snapshot = { items: TreeItemSummary[] };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const folder = (id: string) => ({ id, title: id, isFolder: true });
const note = (id: string) => ({ id, title: id, isFolder: false });
const state = () => useNoteTreeStore.getState();

beforeEach(() => {
  state().resetForSession("user-a");
  vi.clearAllMocks();
});

describe("tree operation coordination", () => {
  it("ignores stale view events for nodes removed by reconciliation", () => {
    state().setSelectedIds(new Set(["removed"]));
    state().setExpandedIds(new Set(["removed"]));
    state().setFocusedId("removed");
    state().setRenamingId("removed");
    expect(state().selectedIds.size).toBe(0);
    expect(state().expandedIds.size).toBe(0);
    expect(state().focusedId).toBeNull();
    expect(state().renamingId).toBeNull();
  });

  it("persists rapid expansion changes in user order", async () => {
    const mutate = vi.fn().mockResolvedValue({ success: true });
    state().setDependencies({ fetch: vi.fn(), fetchChildren: vi.fn(), mutate }, vi.fn());
    state().addItem({ deleted: 0, shared: 0, pinned: 0, id: "folder", title: "folder", isFolder: true });
    await Promise.all([
      state().mutateItem("folder", { isExpanded: true }),
      state().mutateItem("folder", { isExpanded: false }),
      state().mutateItem("folder", { isExpanded: true }),
    ]);
    expect(mutate.mock.calls.map(([body]) => body.data.isExpanded)).toEqual([true, false, true]);
    expect(state().expandedIds.has("folder")).toBe(true);
  });

  it("keeps a moved folder's loaded subtree after an ambiguous committed write", async () => {
    const fetchChildren = vi.fn(async (parentId: string | null) => ({
      items: parentId === "target" ? [folder("moved")] : [note("child")],
    }));
    state().setDependencies({ fetch: vi.fn().mockResolvedValue({ items: [folder("target")] }),
      fetchChildren, mutate: vi.fn().mockRejectedValue(new Error("response lost")) }, vi.fn());
    state().addItem({ deleted: 0, shared: 0, pinned: 0, id: "target", title: "target", isFolder: true });
    state().addItem({ deleted: 0, shared: 0, pinned: 0, id: "moved", title: "moved", isFolder: true });
    state().addItem({ deleted: 0, shared: 0, pinned: 0, id: "child", title: "child", pid: "moved" });
    state().setExpandedIds(new Set(["moved"]));
    await state().moveItem({ noteId: "moved", expectedParentId: null, parentId: "target" });
    expect(state().tree.items.target.children).toEqual(["moved"]);
    expect(state().tree.items.moved.children).toEqual(["child"]);
    expect(fetchChildren.mock.calls.filter(([id]) => id === "target")).toHaveLength(1);
  });

  it("constructs independent defaults and refreshes after a pending bootstrap", async () => {
    const first = deferred<Snapshot>();
    const fetch = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue({ items: [note("new")] });
    state().setDependencies({ fetch, fetchChildren: vi.fn(), mutate: vi.fn() }, vi.fn());
    const init = state().initTree();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const refresh = state().refreshTree();
    first.resolve({ items: [note("old")] });
    await Promise.all([init, refresh]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(state().tree.items.root.children).toEqual(["new"]);
    expect(DEFAULT_TREE).toEqual(createEmptyTree());
  });

  it("runs a publication read after a lazy load already in flight", async () => {
    const lazy = deferred<Snapshot>();
    const fetchChildren = vi.fn().mockReturnValueOnce(lazy.promise)
      .mockResolvedValue({ items: [note("published")] });
    state().setDependencies({ fetch: vi.fn(), fetchChildren, mutate: vi.fn() }, vi.fn());
    state().addItem({ deleted: 0, shared: 0, pinned: 0, id: "folder", title: "folder", isFolder: true });
    const load = state().loadChildren("folder");
    await vi.waitFor(() => expect(fetchChildren).toHaveBeenCalledTimes(1));
    let applied = false;
    const refresh = state().refreshChildren("folder").then(() => { applied = true; });
    await Promise.resolve();
    expect(applied).toBe(false);
    lazy.resolve({ items: [] });
    await Promise.all([load, refresh]);
    expect(fetchChildren).toHaveBeenCalledTimes(2);
    expect(state().tree.items.folder.children).toEqual(["published"]);
  });

  it("discards old responses and cleanup after session reset", async () => {
    const old = deferred<Snapshot>();
    const newRoot = deferred<Snapshot>();
    const oldFetch = vi.fn().mockReturnValue(old.promise);
    state().setDependencies({ fetch: oldFetch, fetchChildren: vi.fn(), mutate: vi.fn() }, vi.fn());
    const oldInit = state().initTree();
    await vi.waitFor(() => expect(oldFetch).toHaveBeenCalledTimes(1));
    const signal: AbortSignal = oldFetch.mock.calls[0][0];
    state().resetForSession("user-b");
    const newFetch = vi.fn().mockReturnValue(newRoot.promise);
    state().setDependencies({ fetch: newFetch, fetchChildren: vi.fn(), mutate: vi.fn() }, vi.fn());
    const newInit = state().initTree();
    await vi.waitFor(() => expect(newFetch).toHaveBeenCalledTimes(1));
    old.resolve({ items: [note("private-a")] });
    await oldInit;
    expect(signal.aborted).toBe(true);
    expect(state().loading).toBe(true);
    expect(state().tree.items["private-a"]).toBeUndefined();
    newRoot.resolve({ items: [note("private-b")] });
    await newInit;
    expect(state().tree.items.root.children).toEqual(["private-b"]);
  });

  it("does not issue later path requests under a new session", async () => {
    const root = deferred<Snapshot>();
    const fetchChildren = vi.fn().mockReturnValue(root.promise);
    state().setDependencies({ fetch: vi.fn(), fetchChildren, mutate: vi.fn() }, vi.fn());
    const publication = state().refreshTreePaths([["course", "module", "file"]]);
    const rejection = expect(publication).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(fetchChildren).toHaveBeenCalledTimes(1));
    state().resetForSession("user-b");
    root.resolve({ items: [folder("course")] });
    await rejection;
    expect(fetchChildren).toHaveBeenCalledTimes(1);
    expect(state().tree).toEqual(createEmptyTree());
  });

  it("retries a read when committed local CRUD lands during its request", async () => {
    const oldRoot = deferred<Snapshot>();
    const fetch = vi.fn().mockReturnValueOnce(oldRoot.promise)
      .mockResolvedValue({ items: [note("created")] });
    state().setDependencies({ fetch, fetchChildren: vi.fn(), mutate: vi.fn() }, vi.fn());
    const init = state().initTree();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    state().addItem({ deleted: 0, shared: 0, pinned: 0, id: "created", title: "created" });
    oldRoot.resolve({ items: [] });
    await init;
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(state().tree.items.root.children).toEqual(["created"]);
  });

  it.each(["refresh", "load", "publication", "move"] as const)(
    "settles %s after repeated concurrent writes without applying stale snapshots",
    async (action) => {
      state().addItem({ deleted: 0, shared: 0, pinned: 0, id: "folder", title: "folder", isFolder: true });
      state().addItem({ deleted: 0, shared: 0, pinned: 0, id: "moved", title: "moved" });
      const rootItems = [folder("folder"), note("moved")];
      const committedIds: string[] = [];
      const snapshotWithConcurrentWrite = (items: TreeItemSummary[]) => {
        const id = `created-${committedIds.length}`;
        committedIds.push(id);
        state().addItem({ deleted: 0, shared: 0, pinned: 0, id, title: id });
        return Promise.resolve({ items });
      };
      const fetch = vi.fn(() => snapshotWithConcurrentWrite(rootItems));
      const fetchChildren = vi.fn((parentId: string | null) =>
        snapshotWithConcurrentWrite(parentId === null ? rootItems : []));
      const mutate = vi.fn().mockResolvedValue({
        success: true, noteId: "moved", oldParentId: null, newParentId: "folder",
      });
      state().setDependencies({ fetch, fetchChildren, mutate }, vi.fn());

      const operation = action === "refresh" ? state().refreshTree()
        : action === "load" ? state().loadChildren("folder")
          : action === "publication" ? state().refreshTreePaths([["folder"]])
            : state().moveItem({ noteId: "moved", expectedParentId: null, parentId: "folder" });
      const settled = action === "refresh" || action === "publication"
        ? expect(operation).rejects.toThrow("Tree kept changing")
        : operation;
      // A failed reconciliation must release later queued writes too.
      const expansion = state().mutateItem("folder", { isExpanded: true });
      await Promise.all([settled, expansion]);

      const branchRead = action === "refresh" || action === "move" ? fetch : fetchChildren;
      expect(branchRead).toHaveBeenCalledTimes(3);
      for (const id of committedIds) expect(state().tree.items[id]).toBeDefined();
      expect(state().tree.items.moved.data?.pid).toBeUndefined();
      expect(state().loading).toBe(false);
      expect(state().loadingChildren.size).toBe(0);
      expect(state().movingIds.size).toBe(0);
      expect(mutate).toHaveBeenCalledWith(
        { action: "mutate", data: { id: "folder", isExpanded: true } },
        expect.any(AbortSignal),
      );
    },
  );

  it("preserves loaded descendants and expansion, prunes detached view state", async () => {
    const fetch = vi.fn().mockResolvedValue({ items: [folder("course")] });
    const fetchChildren = vi.fn().mockResolvedValue({ items: [note("keep")] });
    state().setDependencies({ fetch, fetchChildren, mutate: vi.fn() }, vi.fn());
    state().addItem({ deleted: 0, shared: 0, pinned: 0, id: "course", title: "course", isFolder: true });
    state().addItem({ deleted: 0, shared: 0, pinned: 0, id: "keep", title: "keep", pid: "course" });
    state().addItem({ deleted: 0, shared: 0, pinned: 0, id: "gone", title: "gone", pid: "course" });
    state().setExpandedIds(new Set(["course"]));
    state().setSelectedIds(new Set(["gone", "keep"]));
    state().setFocusedId("gone");
    state().setRenamingId("gone");
    await state().refreshTree();
    expect(state().tree.items.course.children).toEqual(["keep"]);
    expect(state().tree.items.gone).toBeUndefined();
    expect(state().expandedIds).toEqual(new Set(["course"]));
    expect(state().selectedIds).toEqual(new Set(["keep"]));
    expect(state().focusedId).toBeNull();
    expect(state().renamingId).toBeNull();
  });

  it("keeps the previous graph when part of a snapshot batch fails", async () => {
    state().setDependencies({ fetch: vi.fn().mockResolvedValue({ items: [folder("course")] }),
      fetchChildren: vi.fn().mockRejectedValue(new Error("offline")), mutate: vi.fn() }, vi.fn());
    state().addItem({ deleted: 0, shared: 0, pinned: 0, id: "course", title: "before", isFolder: true });
    state().setExpandedIds(new Set(["course"]));
    const before = state().tree;
    await expect(state().refreshTree()).rejects.toThrow("offline");
    expect(state().tree).toBe(before);
    expect(state().error).toBe("Error loading notes");
  });

  it("does not claim an unpublished path has been applied", async () => {
    state().setDependencies({ fetch: vi.fn(), fetchChildren: vi.fn().mockResolvedValue({ items: [] }), mutate: vi.fn() }, vi.fn());
    await expect(state().refreshTreePaths([["missing", "file"]])).rejects.toThrow("not available");
  });

  it("waits for canonical move success and refreshes an unloaded destination", async () => {
    const write = deferred<TreeMoveResult>();
    const fetch = vi.fn().mockResolvedValue({ items: [folder("target")] });
    const fetchChildren = vi.fn().mockResolvedValue({ items: [note("moved")] });
    const mutate = vi.fn().mockReturnValue(write.promise);
    state().setDependencies({ fetch, fetchChildren, mutate }, vi.fn());
    state().addItem({ deleted: 0, shared: 0, pinned: 0, id: "moved", title: "moved" });
    state().addItem({ deleted: 0, shared: 0, pinned: 0, id: "target", title: "target", isFolder: true });
    const move = state().moveItem({ noteId: "moved", expectedParentId: null, parentId: "target" });
    await vi.waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    expect(state().tree.items.root.children).toContain("moved");
    write.resolve({ success: true, noteId: "moved", oldParentId: null, newParentId: "target" });
    await move;
    expect(state().tree.items.root.children).toEqual(["target"]);
    expect(state().tree.items.target.children).toEqual(["moved"]);
    expect(state().tree.items.moved.data?.pid).toBe("target");
    expect(state().movingIds.size).toBe(0);
  });

  it("reconciles ambiguous move failure without erasing newer note state", async () => {
    const write = deferred<TreeMoveResult>();
    const toast = vi.fn();
    state().setDependencies({ fetch: vi.fn().mockResolvedValue({ items: [note("moved"), note("new"), folder("target")] }),
      fetchChildren: vi.fn().mockResolvedValue({ items: [] }), mutate: vi.fn().mockReturnValue(write.promise) }, toast);
    state().addItem({ deleted: 0, shared: 0, pinned: 0, id: "moved", title: "moved" });
    state().addItem({ deleted: 0, shared: 0, pinned: 0, id: "target", title: "target", isFolder: true });
    const move = state().moveItem({ noteId: "moved", expectedParentId: null, parentId: "target" });
    await Promise.resolve();
    state().addItem({ deleted: 0, shared: 0, pinned: 0, id: "new", title: "new" });
    write.reject(new Error("connection lost"));
    await move;
    expect(state().tree.items.root.children).toContain("new");
    expect(toast).toHaveBeenCalledWith(expect.stringContaining("Failed to move"), "error");
  });
});
