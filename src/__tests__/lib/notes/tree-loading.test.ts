import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TREE, ROOT_ID } from "@/lib/notes/types/tree";

const mocks = vi.hoisted(() => ({
  setItem: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/notes/cache", () => ({
  uiCache: {
    setItem: mocks.setItem,
  },
  noteCacheInstance: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    keys: vi.fn().mockResolvedValue([]),
    iterate: vi.fn(),
  },
}));

import useNoteTreeStore from "@/lib/notes/state/tree";

describe("note tree loading state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useNoteTreeStore.setState({
      tree: structuredClone(DEFAULT_TREE),
      pinnedTree: structuredClone(DEFAULT_TREE),
      initLoaded: false,
      loading: false,
      loadingChildren: new Set<string>(),
      expandedIds: new Set<string>(),
      treeAPI: null,
      toast: null,
    });
  });

  it("allows a refresh retry after the initial request fails", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ items: [] });
    const toast = vi.fn();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    useNoteTreeStore.getState().setDependencies(
      { fetch, fetchChildren: vi.fn(), mutate: vi.fn() },
      toast,
    );

    await useNoteTreeStore.getState().initTree();

    expect(useNoteTreeStore.getState().loading).toBe(false);
    expect(useNoteTreeStore.getState().initLoaded).toBe(false);
    expect(toast).toHaveBeenCalledWith("Error loading notes", "error");

    await useNoteTreeStore.getState().refreshTree();

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(useNoteTreeStore.getState().loading).toBe(false);
    expect(useNoteTreeStore.getState().initLoaded).toBe(true);
    consoleError.mockRestore();
  });

  it("does not cache an empty tree when the API returned no response", async () => {
    const toast = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    useNoteTreeStore.getState().setDependencies(
      {
        fetch: vi.fn().mockResolvedValue(undefined),
        fetchChildren: vi.fn(),
        mutate: vi.fn(),
      },
      toast,
    );

    await useNoteTreeStore.getState().initTree();

    expect(useNoteTreeStore.getState().initLoaded).toBe(false);
    expect(mocks.setItem).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith("Error loading notes", "error");
    consoleError.mockRestore();
  });

  it("deduplicates refreshes while a tree request is in flight", async () => {
    let resolveFetch!: (value: { items: never[] }) => void;
    const fetch = vi.fn(
      () =>
        new Promise<{ items: never[] }>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    useNoteTreeStore.getState().setDependencies(
      { fetch, fetchChildren: vi.fn(), mutate: vi.fn() },
      vi.fn(),
    );

    const firstLoad = useNoteTreeStore.getState().initTree();
    const duplicateLoad = useNoteTreeStore.getState().initTree();

    expect(useNoteTreeStore.getState().loading).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);

    resolveFetch({ items: [] });
    await Promise.all([firstLoad, duplicateLoad]);

    expect(useNoteTreeStore.getState().loading).toBe(false);
    expect(useNoteTreeStore.getState().initLoaded).toBe(true);
  });

  it("keeps concurrent folder loads and their loading states independent", async () => {
    const pending = new Map<
      string,
      (value: { items: Array<{ id: string; title: string }> }) => void
    >();
    const fetchChildren = vi.fn(
      (parentId: string | null) =>
        new Promise<{ items: Array<{ id: string; title: string }> }>(
          (resolve) => {
            pending.set(parentId ?? ROOT_ID, resolve);
          },
        ),
    );
    useNoteTreeStore.setState({
      tree: {
        rootId: ROOT_ID,
        items: {
          [ROOT_ID]: { id: ROOT_ID, children: ["folder-a", "folder-b"] },
          "folder-a": { id: "folder-a", children: [] },
          "folder-b": { id: "folder-b", children: [] },
        },
      },
      pinnedTree: structuredClone(DEFAULT_TREE),
    });
    useNoteTreeStore
      .getState()
      .setDependencies(
        { fetch: vi.fn(), fetchChildren, mutate: vi.fn() },
        vi.fn(),
      );

    const loadA = useNoteTreeStore.getState().loadChildren("folder-a");
    const loadB = useNoteTreeStore.getState().loadChildren("folder-b");

    expect([...useNoteTreeStore.getState().loadingChildren]).toEqual([
      "folder-a",
      "folder-b",
    ]);

    pending.get("folder-a")!({
      items: [{ id: "a-child", title: "A child" }],
    });
    await loadA;

    expect([...useNoteTreeStore.getState().loadingChildren]).toEqual([
      "folder-b",
    ]);
    expect(useNoteTreeStore.getState().tree.items["folder-a"].children).toEqual([
      "a-child",
    ]);

    pending.get("folder-b")!({
      items: [{ id: "b-child", title: "B child" }],
    });
    await loadB;

    const { tree, loadingChildren } = useNoteTreeStore.getState();
    expect([...loadingChildren]).toEqual([]);
    expect(tree.items["folder-a"].children).toEqual(["a-child"]);
    expect(tree.items["folder-b"].children).toEqual(["b-child"]);
  });

  it("refreshes published paths without discarding loaded descendants", async () => {
    const fetchChildren = vi.fn(async (parentId: string | null) => {
      if (parentId === null) {
        return {
          items: [
            {
              id: "course",
              title: "Course",
              isFolder: true,
              isExpanded: true,
            },
          ],
        };
      }
      if (parentId === "course") {
        return {
          items: [
            {
              id: "module",
              title: "Module",
              isFolder: true,
              isExpanded: true,
            },
          ],
        };
      }
      return {
        items: [
          { id: "existing", title: "Existing note", isFolder: false },
          { id: "new-note", title: "New note", isFolder: false },
        ],
      };
    });
    const tree = {
      rootId: ROOT_ID,
      items: {
        [ROOT_ID]: { id: ROOT_ID, children: ["course"], childrenLoaded: true },
        course: {
          id: "course",
          children: ["module"],
          childrenLoaded: true,
          isFolder: true,
        },
        module: {
          id: "module",
          children: ["existing"],
          childrenLoaded: true,
          isFolder: true,
        },
        existing: { id: "existing", children: [] },
      },
    };
    useNoteTreeStore.setState({
      tree,
      pinnedTree: tree,
      expandedIds: new Set(["course", "module"]),
    });
    useNoteTreeStore.getState().setDependencies(
      { fetch: vi.fn(), fetchChildren, mutate: vi.fn() },
      vi.fn(),
    );

    await useNoteTreeStore
      .getState()
      .refreshTreePaths([["course", "module", "new-note"]]);

    expect(fetchChildren).toHaveBeenNthCalledWith(1, null);
    expect(fetchChildren).toHaveBeenNthCalledWith(2, "course");
    expect(fetchChildren).toHaveBeenNthCalledWith(3, "module");
    expect(useNoteTreeStore.getState().tree.items.module.children).toEqual([
      "existing",
      "new-note",
    ]);
    expect(useNoteTreeStore.getState().expandedIds).toEqual(
      new Set(["course", "module"]),
    );
  });
});
