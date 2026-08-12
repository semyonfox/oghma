// extracted from Notea (MIT License)
import { create } from "zustand";
import noteCache from "../cache/note";
import { NoteModel } from "@/lib/notes/types/note";
import useSyncStatusStore from "./sync-status";
import type {
  NoteApi,
  NoteCreateRequest,
  NoteUpdateRequest,
} from "../api/note";
import type { NoteTreeState } from "./tree";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Prevent GET requests that began before a save from writing their stale
// response back into the singleton store or IndexedDB after that save.
const noteWriteVersions = new Map<string, number>();

type Toast = (message: string, type?: "error") => void;

type NoteTreeStore = {
  getState: () => Pick<
    NoteTreeState,
    "addItem" | "mutateItem" | "removeItem"
  >;
};

function withDefaultContent(note: NoteModel): NoteModel {
  return { ...note, content: note.content || "\n" };
}

export interface NoteStoreState {
  note: NoteModel | undefined;
  loading: boolean;
  noteAPI: NoteApi | null;
  treeStore: NoteTreeStore | null;
  toast: Toast | null;
  fetchNote: (id: string) => Promise<NoteModel | undefined>;
  removeNote: (id: string) => Promise<void>;
  mutateNote: (id: string, payload: NoteUpdateRequest) => Promise<void>;
  createNote: (
    body: NoteCreateRequest,
  ) => Promise<NoteModel | undefined>;
  createFolder: (parentId?: string) => Promise<NoteModel | undefined>;
  setDependencies: (
    noteAPI: NoteApi,
    treeStore: NoteTreeStore,
    toast: Toast,
  ) => void;
}

const useNoteStore = create<NoteStoreState>((set, get) => ({
  note: undefined,
  loading: false,
  noteAPI: null,
  treeStore: null,
  toast: null,

  setDependencies: (noteAPI, treeStore, toast) => {
    set({ noteAPI, treeStore, toast });
  },

  fetchNote: async (id: string) => {
    const state = get();
    const { noteAPI } = state;

    if (!noteAPI) {
      console.warn("noteAPI not initialized yet");
      return undefined;
    }

    if (!UUID_RE.test(id)) {
      console.warn(
        `[noteStore] fetchNote: non-UUID id ${id} — evicting from cache`,
      );
      await noteCache.removeItem(id);
      return undefined;
    }

    const cache = await noteCache.getItem(id);
    if (cache) {
      set({ note: cache });
    }
    const writeVersionAtStart = noteWriteVersions.get(id) ?? 0;
    const result = await noteAPI.find(id);

    if (!result) {
      return;
    }

    if ((noteWriteVersions.get(id) ?? 0) !== writeVersionAtStart) {
      const currentNote = get().note;
      if (currentNote?.id === id) return currentNote;
      return (await noteCache.getItem(id)) ?? undefined;
    }

    const note = withDefaultContent(result);
    set({ note });
    await noteCache.setItem(id, note);

    return note;
  },

  removeNote: async (id: string) => {
    const state = get();
    const { noteAPI, treeStore } = state;

    if (!noteAPI || !treeStore) {
      console.warn("noteAPI or treeStore not initialized yet");
      return;
    }

    try {
      const result = await noteAPI.remove(id);
      if (!result?.success) throw new Error("Note deletion failed");
    } catch (error) {
      console.error("Error deleting note:", error);
      throw error;
    }

    await noteCache.removeItem(id);
    await treeStore.getState().removeItem(id);
    if (state.note?.id === id) {
      set({ note: undefined });
    }
  },

  mutateNote: async (id, payload) => {
    const state = get();
    const { noteAPI, treeStore } = state;

    if (!noteAPI || !treeStore) {
      console.warn("noteAPI or treeStore not initialized yet");
      return;
    }

    let note = await noteCache.getItem(id);
    if (!note && state.note?.id === id) {
      note = state.note;
      if (note) await noteCache.setItem(id, note);
    }
    if (!note) {
      try {
        const fetched = await noteAPI.find(id);
        if (fetched) {
          note = fetched;
          await noteCache.setItem(id, fetched);
        }
      } catch {
        // The write is still authoritative when a stale cache entry cannot load.
      }
    }

    set((state) => ({
      note: state.note?.id === id ? { ...state.note, ...payload } : state.note,
    }));

    noteWriteVersions.set(id, (noteWriteVersions.get(id) ?? 0) + 1);

    await noteAPI.mutate(id, payload);

    noteWriteVersions.set(id, (noteWriteVersions.get(id) ?? 0) + 1);

    useSyncStatusStore.getState().markSynced(id);
    await noteCache.mutateItem(id, payload);
    if (note) {
      await treeStore.getState().mutateItem(id, {
        data: {
          ...note,
          ...payload,
        },
      });
    }
  },

  createNote: async (body) => {
    const state = get();
    const { noteAPI, treeStore, toast } = state;

    if (!noteAPI || !treeStore) {
      console.warn("noteAPI or treeStore not initialized yet");
      return;
    }

    const result = await noteAPI.create(body);

    if (!result) {
      toast?.(noteAPI.error || "Failed to create note", "error");
      return;
    }

    const note = withDefaultContent(result);
    await noteCache.setItem(note.id, note);
    set({ note });
    treeStore.getState().addItem(note);

    useSyncStatusStore.getState().markNew(note.id);

    return note;
  },

  createFolder: async (parentId?: string) => {
    const state = get();
    const { noteAPI, treeStore, toast } = state;

    if (!noteAPI || !treeStore) {
      console.warn("noteAPI or treeStore not initialized yet");
      return;
    }

    const body: NoteCreateRequest = {
      title: "New Folder",
      content: "",
      isFolder: true,
      pid: parentId,
    };

    const result = await noteAPI.create(body);

    if (!result) {
      toast?.(noteAPI.error || "Failed to create folder", "error");
      return;
    }

    await noteCache.setItem(result.id, result);
    treeStore.getState().addItem(result);

    useSyncStatusStore.getState().markNew(result.id);

    return result;
  },
}));

export default useNoteStore;
