import { beforeEach, describe, expect, it, vi } from "vitest";
import { NOTE_DELETED, NOTE_PINNED, NOTE_SHARED } from "@/lib/notes/types/meta";

const mocks = vi.hoisted(() => ({
  removeItem: vi.fn(),
  publishWorkspaceInvalidation: vi.fn(),
}));

vi.mock("@/lib/notes/cache/note", () => ({
  default: {
    removeItem: mocks.removeItem,
  },
}));

vi.mock("@/lib/notes/workspace-invalidation", () => ({
  publishWorkspaceInvalidation: mocks.publishWorkspaceInvalidation,
}));

import useTrashStore from "@/lib/notes/state/trash";

const note = {
  id: "note-1",
  title: "Restorable",
  pid: "stale-client-parent",
  deleted: NOTE_DELETED.DELETED,
  pinned: NOTE_PINNED.UNPINNED,
  shared: NOTE_SHARED.PRIVATE,
};

describe("trash state", () => {
  const mutate = vi.fn();
  const list = vi.fn();
  const refreshTree = vi.fn();
  const deleteItem = vi.fn();
  const treeState = {
    ownerUserId: "user-1" as string | null,
    generation: 1,
    refreshTree,
    deleteItem,
  };
  const treeStore = {
    getState: () => treeState,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    treeState.ownerUserId = "user-1";
    treeState.generation = 1;
    useTrashStore.getState().setDependencies({ list, mutate }, treeStore);
  });

  it("uses the server-authoritative parent without mutating the input note", async () => {
    mutate.mockResolvedValue({ success: true, parentId: "saved-parent" });

    const restored = await useTrashStore.getState().restoreNote(note);

    expect(mutate).toHaveBeenCalledWith({
      action: "restore",
      data: { id: note.id },
    });
    expect(note.pid).toBe("stale-client-parent");
    expect(restored).toMatchObject({
      pid: "saved-parent",
      deleted: NOTE_DELETED.NORMAL,
    });
    expect(mocks.removeItem).toHaveBeenCalledWith(note.id);
    expect(refreshTree).toHaveBeenCalledOnce();
  });

  it("uses root when the server reports that the saved parent is unavailable", async () => {
    mutate.mockResolvedValue({ success: true, parentId: null });

    const restored = await useTrashStore.getState().restoreNote(note);

    expect(restored.pid).toBeUndefined();
    expect(refreshTree).toHaveBeenCalledOnce();
  });

  it("does not change local state when a restore request fails", async () => {
    mutate.mockResolvedValue(undefined);

    const restored = await useTrashStore.getState().restoreNote(note);

    expect(restored).toBe(note);
    expect(mocks.removeItem).not.toHaveBeenCalled();
    expect(refreshTree).not.toHaveBeenCalled();
  });

  it("publishes a late restore for its original owner without touching the new workspace", async () => {
    let resolveMutation!: (value: { success: true; parentId: string }) => void;
    mutate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveMutation = resolve;
        }),
    );

    const restoring = useTrashStore.getState().restoreNote(note);
    treeState.ownerUserId = "user-2";
    treeState.generation = 2;
    resolveMutation({ success: true, parentId: "saved-parent" });

    await expect(restoring).resolves.toMatchObject({
      pid: "saved-parent",
      deleted: NOTE_DELETED.NORMAL,
    });
    expect(mocks.publishWorkspaceInvalidation).toHaveBeenCalledWith(
      "user-1",
      "tree",
    );
    expect(mocks.removeItem).not.toHaveBeenCalled();
    expect(refreshTree).not.toHaveBeenCalled();
  });

  it("loads trash from the server and applies title filtering locally", async () => {
    list.mockResolvedValue([
      {
        id: "note-1",
        title: "Algorithms",
        isFolder: false,
        deletedAt: "2026-08-12T10:00:00.000Z",
      },
      {
        id: "note-2",
        title: "Databases",
        isFolder: false,
        deletedAt: "2026-08-12T11:00:00.000Z",
      },
    ]);

    await useTrashStore.getState().filterNotes("algo");

    expect(useTrashStore.getState().list).toEqual([
      expect.objectContaining({
        id: "note-1",
        deleted: NOTE_DELETED.DELETED,
      }),
    ]);
  });

  it("permanently removes local data only after the server succeeds", async () => {
    mutate.mockResolvedValue(undefined);
    await useTrashStore.getState().deleteNote(note.id);
    expect(mocks.removeItem).not.toHaveBeenCalled();
    expect(deleteItem).not.toHaveBeenCalled();

    mutate.mockResolvedValue({ success: true });
    await useTrashStore.getState().deleteNote(note.id);
    expect(mocks.removeItem).toHaveBeenCalledWith(note.id);
    expect(deleteItem).toHaveBeenCalledWith(note.id);
  });

  it("publishes a late deletion for its original owner without touching the new workspace", async () => {
    let resolveMutation!: (value: { success: true }) => void;
    mutate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveMutation = resolve;
        }),
    );

    const deleting = useTrashStore.getState().deleteNote(note.id);
    treeState.ownerUserId = "user-2";
    treeState.generation = 2;
    resolveMutation({ success: true });
    await deleting;

    expect(mocks.publishWorkspaceInvalidation).toHaveBeenCalledWith(
      "user-1",
      "tree",
    );
    expect(mocks.removeItem).not.toHaveBeenCalled();
    expect(deleteItem).not.toHaveBeenCalled();
  });
});
