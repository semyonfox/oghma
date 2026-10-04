import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NoteApi } from "@/lib/notes/api/note";
import type { NoteModel } from "@/lib/notes/types/note";
import type { NoteStoreState } from "@/lib/notes/state/note";
import type { TreeItemUpdate } from "@/lib/notes/types/tree";
import { NOTE_DELETED, NOTE_PINNED, NOTE_SHARED } from "@/lib/notes/types/meta";
import useNoteStore from "@/lib/notes/state/note";
import useSyncStatusStore from "@/lib/notes/state/sync-status";
import noteCache from "@/lib/notes/cache/note";

vi.mock("@/lib/notes/cache/note", () => ({
  default: {
    getItem: vi.fn(async () => undefined),
    mutateItem: vi.fn(async () => {}),
    setItem: vi.fn(async () => {}),
  },
}));

const id = "0198f4ec-4f16-7000-8000-000000000001";

function note(content: string): NoteModel {
  return {
    id,
    title: "Note",
    content,
    deleted: NOTE_DELETED.NORMAL,
    shared: NOTE_SHARED.PRIVATE,
    pinned: NOTE_PINNED.UNPINNED,
  };
}

function noteApi(mutate: NoteApi["mutate"]): NoteApi {
  return {
    find: vi.fn(async () => undefined),
    create: vi.fn(async () => undefined),
    mutate,
    remove: vi.fn(async () => undefined),
  };
}

function treeStore() {
  const mutateItem = vi.fn(async (_id: string, _data: TreeItemUpdate) => {});
  const store: NonNullable<NoteStoreState["treeStore"]> = {
    getState: () => ({
      addItem: vi.fn((_item: NoteModel) => {}),
      mutateItem,
      removeItem: vi.fn(async (_id: string) => {}),
    }),
  };
  return { store, mutateItem };
}

describe("note save result handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useNoteStore.setState({ note: undefined, noteAPI: null, treeStore: null });
    useSyncStatusStore.setState({ status: {} });
  });

  it("marks synced and updates the cache after a successful API response", async () => {
    const { store } = treeStore();
    const mutate = vi.fn(async () => note("saved"));
    useNoteStore.getState().setDependencies(noteApi(mutate), store, vi.fn());
    useSyncStatusStore.getState().markModified(id);

    await useNoteStore.getState().mutateNote(id, { content: "saved" });

    expect(mutate).toHaveBeenCalledWith(id, { content: "saved" });
    expect(useSyncStatusStore.getState().getStatus(id)).toBe("synced");
    expect(noteCache.mutateItem).toHaveBeenCalledWith(id, { content: "saved" });
  });

  it("keeps the note modified when the API rejects", async () => {
    const { store, mutateItem } = treeStore();
    const mutate = vi.fn(async (): Promise<NoteModel> => {
      throw new Error("offline");
    });
    useNoteStore.getState().setDependencies(noteApi(mutate), store, vi.fn());
    useSyncStatusStore.getState().markModified(id);

    await expect(
      useNoteStore.getState().mutateNote(id, { content: "unsaved" }),
    ).rejects.toThrow("offline");

    expect(useSyncStatusStore.getState().getStatus(id)).toBe("modified");
    expect(noteCache.mutateItem).not.toHaveBeenCalled();
    expect(mutateItem).not.toHaveBeenCalled();
  });

  it("keeps the note modified when the API resolves without a response", async () => {
    const { store, mutateItem } = treeStore();
    useNoteStore
      .getState()
      .setDependencies(noteApi(vi.fn(async () => undefined)), store, vi.fn());
    useSyncStatusStore.getState().markModified(id);

    await expect(
      useNoteStore.getState().mutateNote(id, { content: "unsaved" }),
    ).rejects.toThrow("Note save failed");

    expect(useSyncStatusStore.getState().getStatus(id)).toBe("modified");
    expect(noteCache.mutateItem).not.toHaveBeenCalled();
    expect(mutateItem).not.toHaveBeenCalled();
  });

  it("rejects a save before the note API is ready", async () => {
    await expect(
      useNoteStore.getState().mutateNote(id, { content: "unsaved" }),
    ).rejects.toThrow("Note save unavailable");

    expect(noteCache.mutateItem).not.toHaveBeenCalled();
  });
});
