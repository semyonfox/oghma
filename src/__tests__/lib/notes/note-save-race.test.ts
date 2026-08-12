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
    useNoteStore.setState({ note: undefined, loading: false });
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
    const api = noteApi({ find, mutate: vi.fn().mockResolvedValue(undefined) });
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
});
