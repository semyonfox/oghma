import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TREE } from "@/lib/notes/types/tree";

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
      treeAPI: null,
      noteAPI: null,
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
    useNoteTreeStore.getState().setDependencies({ fetch }, {}, toast);

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

  it("deduplicates refreshes while a tree request is in flight", async () => {
    let resolveFetch!: (value: { items: never[] }) => void;
    const fetch = vi.fn(
      () =>
        new Promise<{ items: never[] }>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    useNoteTreeStore.getState().setDependencies({ fetch }, {}, vi.fn());

    const firstLoad = useNoteTreeStore.getState().initTree();
    const duplicateLoad = useNoteTreeStore.getState().initTree();

    expect(useNoteTreeStore.getState().loading).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);

    resolveFetch({ items: [] });
    await Promise.all([firstLoad, duplicateLoad]);

    expect(useNoteTreeStore.getState().loading).toBe(false);
    expect(useNoteTreeStore.getState().initLoaded).toBe(true);
  });
});
