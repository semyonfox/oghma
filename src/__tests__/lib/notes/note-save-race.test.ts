import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  NOTE_DELETED,
  NOTE_PINNED,
  NOTE_SHARED,
} from "@/lib/notes/types/meta";
import type { NoteApi } from "@/lib/notes/api/note";
import type { NoteModel } from "@/lib/notes/types/note";

const memory = vi.hoisted(() => new Map<string, NoteModel>());

vi.mock("@/lib/notes/cache/note", () => ({
  default: {
    getItem: vi.fn(async (id: string) => memory.get(id)),
    setItem: vi.fn(async (id: string, note: NoteModel) => {
      memory.set(id, note);
    }),
    mutateItem: vi.fn(async (id: string, payload: Partial<NoteModel>) => {
      const existing = memory.get(id);
      if (existing) memory.set(id, { ...existing, ...payload });
    }),
    removeItem: vi.fn(),
  },
}));

vi.mock("@/lib/notes/workspace-invalidation", () => ({
  publishWorkspaceInvalidation: vi.fn(),
}));
import { publishWorkspaceInvalidation } from "@/lib/notes/workspace-invalidation";

import useNoteStore from "@/lib/notes/state/note";
import noteCache from "@/lib/notes/cache/note";

const NOTE_ID = "0198f4ec-4f16-7000-8000-000000000001";

function note(overrides: Partial<NoteModel> = {}): NoteModel {
  return {
    id: NOTE_ID,
    title: "Untitled",
    deleted: NOTE_DELETED.NORMAL,
    shared: NOTE_SHARED.PRIVATE,
    pinned: NOTE_PINNED.UNPINNED,
    ...overrides,
  };
}

function noteApi(overrides: Partial<NoteApi>): NoteApi {
  return {
    find: vi.fn(async () => undefined),
    create: vi.fn(async () => undefined),
    mutate: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    ...overrides,
  };
}

function treeStore() {
  return {
    getState: () => ({
      addItem: vi.fn(),
      mutateItem: vi.fn().mockResolvedValue(undefined),
      removeItem: vi.fn().mockResolvedValue(undefined),
    }),
  };
}

describe("note save/fetch coordination", () => {
  beforeEach(() => {
    memory.clear();
    vi.clearAllMocks();
    useNoteStore.setState({
      note: undefined,
      loading: false,
      ownerUserId: "user-1",
      generation: 0,
      sessionReady: true,
    });
  });

  it("does not let a GET started before save overwrite the saved cache", async () => {
    const id = NOTE_ID;
    memory.set(id, note({ content: "cached" }));
    let resolveFind!: (result: NoteModel) => void;
    const find = vi.fn(
      () =>
        new Promise<NoteModel>((resolve) => {
          resolveFind = resolve;
        }),
    );
    const api = noteApi({
      find,
      mutate: vi.fn().mockResolvedValue(note({ content: "saved in full" })),
    });
    useNoteStore.getState().setDependencies(api, treeStore(), vi.fn());

    const pendingFetch = useNoteStore.getState().fetchNote(id);
    await vi.waitFor(() => expect(find).toHaveBeenCalled());
    await useNoteStore.getState().mutateNote(id, { content: "saved in full" });
    resolveFind(note({ id, content: "stale and shorter" }));

    await expect(pendingFetch).resolves.toMatchObject({ content: "saved in full" });
    expect(memory.get(id)).toMatchObject({ content: "saved in full" });
    expect(useNoteStore.getState().note).toMatchObject({ content: "saved in full" });
  });

  it("keeps local note and tree state when server deletion fails", async () => {
    const id = NOTE_ID;
    const removeItem = vi.fn();
    const api = noteApi({ remove: vi.fn().mockResolvedValue(undefined) });
    const tree = {
      getState: () => ({
        addItem: vi.fn(),
        mutateItem: vi.fn().mockResolvedValue(undefined),
        removeItem,
      }),
    };
    useNoteStore.setState({ note: note({ id }) });
    useNoteStore.getState().setDependencies(api, tree, vi.fn());
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(useNoteStore.getState().removeNote(id)).rejects.toThrow(
      "Note deletion failed",
    );

    expect(noteCache.removeItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(useNoteStore.getState().note?.id).toBe(id);
    consoleError.mockRestore();
  });

  it.each(["delete", "title", "pin", "note", "folder"] as const)(
    "invalidates the original owner's tabs after a late successful %s", async (operation) => {
      let finish!: (value: NoteModel & { success: true }) => void;
      const remote = vi.fn(() => new Promise<NoteModel & { success: true }>((resolve) => { finish = resolve; }));
      const original = note();
      memory.set(NOTE_ID, original);
      useNoteStore.setState({ note: original });
      useNoteStore.getState().setDependencies(
        noteApi({ remove: remote, mutate: remote, create: remote }), treeStore(), vi.fn(),
      );
      const store = useNoteStore.getState();
      const pending = operation === "delete" ? store.removeNote(NOTE_ID)
        : operation === "title" ? store.mutateNote(NOTE_ID, { title: "Renamed" })
        : operation === "pin" ? store.mutateNote(NOTE_ID, { pinned: NOTE_PINNED.PINNED })
        : operation === "note" ? store.createNote({ title: "New note", content: "" })
        : store.createFolder();
      await vi.waitFor(() => expect(remote).toHaveBeenCalledOnce());
      useNoteStore.getState().resetForSession("user-2");
      memory.clear();
      finish({ ...original, success: true });
      await pending;

      expect(publishWorkspaceInvalidation).toHaveBeenCalledExactlyOnceWith("user-1", "tree");
      expect(useNoteStore.getState().note).toBeUndefined();
      expect(memory.size).toBe(0);
    },
  );

  it("invalidates tabs even if cache cleanup fails after a successful deletion", async () => {
    useNoteStore.getState().setDependencies(
      noteApi({ remove: vi.fn().mockResolvedValue({ success: true }) }), treeStore(), vi.fn(),
    );
    vi.mocked(noteCache.removeItem).mockRejectedValueOnce(new Error("cache unavailable"));
    await expect(useNoteStore.getState().removeNote(NOTE_ID)).rejects.toThrow("cache unavailable");
    expect(publishWorkspaceInvalidation).toHaveBeenCalledExactlyOnceWith("user-1", "tree");
  });

  it("does not cache a save when the API returns no canonical note", async () => {
    const original = note({ content: "before" });
    memory.set(NOTE_ID, original);
    useNoteStore.setState({ note: original });
    useNoteStore.getState().setDependencies(
      noteApi({ mutate: vi.fn().mockResolvedValue(undefined) }),
      treeStore(),
      vi.fn(),
    );

    await expect(
      useNoteStore.getState().mutateNote(NOTE_ID, { content: "after" }),
    ).rejects.toThrow("Failed to save note");

    expect(memory.get(NOTE_ID)).toEqual(original);
    expect(useNoteStore.getState().note).toEqual(original);
  });

  it("drops a note response that finishes after the workspace changes owner", async () => {
    let resolveFind!: (result: NoteModel) => void;
    const find = vi.fn(
      () =>
        new Promise<NoteModel>((resolve) => {
          resolveFind = resolve;
        }),
    );
    useNoteStore
      .getState()
      .setDependencies(noteApi({ find }), treeStore(), vi.fn());

    const pendingFetch = useNoteStore.getState().fetchNote(NOTE_ID);
    await vi.waitFor(() => expect(find).toHaveBeenCalledOnce());
    useNoteStore.getState().resetForSession("user-2");
    resolveFind(note({ content: "belongs to user 1" }));

    await expect(pendingFetch).resolves.toBeUndefined();
    expect(useNoteStore.getState().note).toBeUndefined();
    expect(memory.has(NOTE_ID)).toBe(false);
  });

  it("blocks a queued save while session caches are being cleared", async () => {
    memory.set(NOTE_ID, note({ content: "old content" }));
    const mutate = vi.fn();
    const api = noteApi({ mutate });
    useNoteStore.getState().resetForSession("user-1");
    useNoteStore.getState().setDependencies(api, treeStore(), vi.fn());

    await useNoteStore
      .getState()
      .mutateNote(NOTE_ID, { content: "late autosave" });

    expect(mutate).not.toHaveBeenCalled();
  });

  it("force refresh bypasses an older shared read and fences its response", async () => {
    let resolveOld!: (result: NoteModel) => void;
    const fresh = note({ content: "imported content" });
    const find = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<NoteModel>((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce(fresh);
    useNoteStore
      .getState()
      .setDependencies(noteApi({ find }), treeStore(), vi.fn());

    const oldRead = useNoteStore.getState().fetchNote(NOTE_ID);
    await vi.waitFor(() => expect(find).toHaveBeenCalledOnce());
    await expect(
      useNoteStore.getState().fetchNote(NOTE_ID, { forceFresh: true }),
    ).resolves.toMatchObject({ content: "imported content" });
    resolveOld(note({ content: "pre-import content" }));

    await expect(oldRead).resolves.toMatchObject({ content: "imported content" });
    expect(find).toHaveBeenNthCalledWith(2, NOTE_ID, { deduplicate: false });
    expect(memory.get(NOTE_ID)).toMatchObject({ content: "imported content" });
  });

  it("does not let force refresh overwrite a user save made while it loads", async () => {
    const original = note({ content: "before" });
    const saved = note({ content: "user edit" });
    memory.set(NOTE_ID, original);
    let resolveFresh!: (result: NoteModel) => void;
    const find = vi.fn(
      () =>
        new Promise<NoteModel>((resolve) => {
          resolveFresh = resolve;
        }),
    );
    useNoteStore.getState().setDependencies(
      noteApi({ find, mutate: vi.fn().mockResolvedValue(saved) }),
      treeStore(),
      vi.fn(),
    );

    const refresh = useNoteStore
      .getState()
      .fetchNote(NOTE_ID, { forceFresh: true });
    await vi.waitFor(() => expect(find).toHaveBeenCalledOnce());
    await useNoteStore
      .getState()
      .mutateNote(NOTE_ID, { content: "user edit" });
    resolveFresh(note({ content: "imported content" }));

    await expect(refresh).rejects.toThrow("Note changed during refresh");
    expect(memory.get(NOTE_ID)).toMatchObject({ content: "user edit" });
  });

  it("does not let a delayed failed save revert a newer successful save", async () => {
    const original = note({ content: "before" });
    const newer = note({ content: "newer save" });
    memory.set(NOTE_ID, original);
    useNoteStore.setState({ note: original });
    let resolveOlder!: (result: NoteModel | undefined) => void;
    const mutate = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<NoteModel | undefined>((resolve) => {
            resolveOlder = resolve;
          }),
      )
      .mockResolvedValueOnce(newer);
    useNoteStore
      .getState()
      .setDependencies(noteApi({ mutate }), treeStore(), vi.fn());

    const olderSave = useNoteStore
      .getState()
      .mutateNote(NOTE_ID, { content: "older save" });
    await vi.waitFor(() => expect(mutate).toHaveBeenCalledOnce());
    await useNoteStore
      .getState()
      .mutateNote(NOTE_ID, { content: "newer save" });
    resolveOlder(undefined);

    await expect(olderSave).resolves.toBeUndefined();
    expect(memory.get(NOTE_ID)).toMatchObject({ content: "newer save" });
    expect(useNoteStore.getState().note).toMatchObject({
      content: "newer save",
    });
  });
});
