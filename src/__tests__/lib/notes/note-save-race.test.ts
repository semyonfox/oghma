import { beforeEach, describe, expect, it, vi } from "vitest";

const memory = vi.hoisted(() => new Map<string, Record<string, unknown>>());

vi.mock("@/lib/notes/cache/note", () => ({
  default: {
    getItem: vi.fn(async (id: string) => memory.get(id)),
    setItem: vi.fn(async (id: string, note: Record<string, unknown>) => {
      memory.set(id, note);
    }),
    mutateItem: vi.fn(async (id: string, payload: Record<string, unknown>) => {
      memory.set(id, { ...memory.get(id), ...payload });
    }),
    removeItem: vi.fn(),
  },
}));

import useNoteStore from "@/lib/notes/state/note";

describe("note save/fetch coordination", () => {
  beforeEach(() => {
    memory.clear();
    useNoteStore.setState({ note: undefined, loading: false });
  });

  it("does not let a GET started before save overwrite the saved cache", async () => {
    const id = "0198f4ec-4f16-7000-8000-000000000001";
    memory.set(id, { id, content: "cached" });
    let resolveFind!: (note: Record<string, unknown>) => void;
    const find = vi.fn(
      () =>
        new Promise<Record<string, unknown>>((resolve) => {
          resolveFind = resolve;
        }),
    );
    const noteAPI = { find, mutate: vi.fn().mockResolvedValue({}) };
    const treeStore = {
      getState: () => ({ mutateItem: vi.fn().mockResolvedValue(undefined) }),
    };
    useNoteStore.getState().setDependencies(noteAPI, treeStore, vi.fn());

    const pendingFetch = useNoteStore.getState().fetchNote(id);
    await vi.waitFor(() => expect(find).toHaveBeenCalled());
    await useNoteStore.getState().mutateNote(id, { content: "saved in full" });
    resolveFind({ id, content: "stale and shorter" });

    await expect(pendingFetch).resolves.toMatchObject({ content: "saved in full" });
    expect(memory.get(id)).toMatchObject({ content: "saved in full" });
    expect(useNoteStore.getState().note).toMatchObject({ content: "saved in full" });
  });
});
