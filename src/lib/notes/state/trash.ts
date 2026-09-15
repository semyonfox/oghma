// extracted from Notea (MIT License)
import { create } from "zustand";
import noteCache from "../cache/note";
import {
  NOTE_DELETED,
  NOTE_PINNED,
  NOTE_SHARED,
} from "@/lib/notes/types/meta";
import { NoteCacheItem } from "../cache";
import { NoteModel } from "@/lib/notes/types/note";
import type {
  TrashListItem,
  TrashMutationBody,
  TrashMutationResponse,
} from "@/lib/notes/api/trash";
import { publishWorkspaceInvalidation } from "../workspace-invalidation";
import useNoteStore from "./note";

interface TrashAPI {
  list: () => Promise<TrashListItem[] | undefined>;
  mutate: (
    body: TrashMutationBody,
  ) => Promise<TrashMutationResponse | undefined>;
}

interface TrashTreeStore {
  getState: () => {
    ownerUserId: string | null;
    generation: number;
    refreshTree: () => Promise<void>;
    deleteItem: (id: string) => Promise<void>;
  };
}

function isMutationCurrent(
  treeStore: TrashTreeStore,
  ownerUserId: string | null,
  generation: number,
): boolean {
  const state = treeStore.getState();
  return (
    state.generation === generation && state.ownerUserId === ownerUserId
  );
}

export interface TrashStoreState {
  keyword: string | undefined;
  list: NoteCacheItem[] | undefined;
  trashAPI: TrashAPI | null;
  treeStore: TrashTreeStore | null;
  filterNotes: (keyword?: string) => Promise<void>;
  restoreNote: (note: NoteModel) => Promise<NoteModel>;
  deleteNote: (id: string) => Promise<void>;
  setDependencies: (trashAPI: TrashAPI, treeStore: TrashTreeStore) => void;
}

const useTrashStore = create<TrashStoreState>((set, get) => ({
  keyword: undefined,
  list: undefined,
  trashAPI: null,
  treeStore: null,

  setDependencies: (trashAPI, treeStore) => {
    set({ trashAPI, treeStore });
  },

  filterNotes: async (keyword = "") => {
    const { trashAPI } = get();
    if (!trashAPI) return;
    const generation = useNoteStore.getState().generation;

    const normalizedKeyword = keyword.trim().toLocaleLowerCase();
    const serverItems = await trashAPI.list();
    if (!serverItems || useNoteStore.getState().generation !== generation) return;

    const items = serverItems
      .filter(
        (item) =>
          !normalizedKeyword ||
          item.title.toLocaleLowerCase().includes(normalizedKeyword),
      )
      .map<NoteCacheItem>((item) => ({
        ...item,
        deleted: NOTE_DELETED.DELETED,
        pinned: NOTE_PINNED.UNPINNED,
        shared: NOTE_SHARED.PRIVATE,
      }));
    set({ keyword, list: items });
  },

  restoreNote: async (note) => {
    const { trashAPI, treeStore } = get();
    if (!trashAPI || !treeStore) {
      console.warn("trashAPI or treeStore not initialized yet");
      return note;
    }
    const mutationTree = treeStore.getState();
    const mutationOwner = mutationTree.ownerUserId;
    const mutationGeneration = mutationTree.generation;

    const result = await trashAPI.mutate({
      action: "restore",
      data: { id: note.id },
    });
    if (!result?.success) return note;
    if (mutationOwner) publishWorkspaceInvalidation(mutationOwner, "tree");

    const parentId = result.parentId ?? undefined;
    const restoredNote = {
      ...note,
      pid: parentId,
      deleted: NOTE_DELETED.NORMAL,
    };
    if (!isMutationCurrent(treeStore, mutationOwner, mutationGeneration)) {
      return restoredNote;
    }
    await noteCache.removeItem(note.id);
    if (!isMutationCurrent(treeStore, mutationOwner, mutationGeneration)) {
      return restoredNote;
    }
    await treeStore.getState().refreshTree();

    return restoredNote;
  },

  deleteNote: async (id) => {
    const { trashAPI, treeStore } = get();
    if (!trashAPI || !treeStore) {
      console.warn("trashAPI or treeStore not initialized yet");
      return;
    }
    const mutationTree = treeStore.getState();
    const mutationOwner = mutationTree.ownerUserId;
    const mutationGeneration = mutationTree.generation;

    const result = await trashAPI.mutate({
      action: "delete",
      data: { id },
    });
    if (!result?.success) return;
    if (mutationOwner) publishWorkspaceInvalidation(mutationOwner, "tree");

    if (!isMutationCurrent(treeStore, mutationOwner, mutationGeneration)) {
      return;
    }
    await noteCache.removeItem(id);
    if (!isMutationCurrent(treeStore, mutationOwner, mutationGeneration)) return;
    await treeStore.getState().deleteItem(id);
  },
}));

export default useTrashStore;
