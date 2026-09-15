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
import { publishWorkspaceInvalidation } from "../workspace-invalidation";
import { clearDeduplicationCache } from "../api/request-deduplicator";

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
  ownerUserId: string | null;
  generation: number;
  sessionReady: boolean;
  noteAPI: NoteApi | null;
  treeStore: NoteTreeStore | null;
  toast: Toast | null;
  fetchNote: (
    id: string,
    options?: { forceFresh?: boolean },
  ) => Promise<NoteModel | undefined>;
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
  resetForSession: (userId: string | null) => number;
  markSessionReady: (generation: number) => void;
}

const useNoteStore = create<NoteStoreState>((set, get) => ({
  note: undefined,
  loading: false,
  ownerUserId: null,
  generation: 0,
  sessionReady: true,
  noteAPI: null,
  treeStore: null,
  toast: null,

  setDependencies: (noteAPI, treeStore, toast) => {
    set({ noteAPI, treeStore, toast });
  },

  resetForSession: (userId) => {
    get().noteAPI?.abort?.();
    noteWriteVersions.clear();
    const generation = get().generation + 1;
    set({
      note: undefined,
      loading: false,
      ownerUserId: userId,
      generation,
      sessionReady: false,
      noteAPI: null,
      treeStore: null,
      toast: null,
    });
    return generation;
  },

  markSessionReady: (generation) => {
    if (get().generation === generation) set({ sessionReady: true });
  },

  fetchNote: async (id, options = {}) => {
    const state = get();
    const { noteAPI, generation, sessionReady } = state;
    const forceFresh = options.forceFresh === true;

    if (!noteAPI || !sessionReady) {
      if (forceFresh) throw new Error("Note store is not ready");
      console.warn("noteAPI not initialized yet");
      return undefined;
    }

    if (!UUID_RE.test(id)) {
      console.warn(
        `[noteStore] fetchNote: non-UUID id ${id} — evicting from cache`,
      );
      await noteCache.removeItem(id);
      if (forceFresh) throw new Error("Invalid note ID");
      return undefined;
    }

    if (forceFresh) {
      clearDeduplicationCache();
      noteWriteVersions.set(id, (noteWriteVersions.get(id) ?? 0) + 1);
    } else {
      const cache = await noteCache.getItem(id);
      if (get().generation !== generation) return undefined;
      if (cache) set({ note: cache });
    }
    const writeVersionAtStart = noteWriteVersions.get(id) ?? 0;
    const result = await noteAPI.find(
      id,
      forceFresh ? { deduplicate: false } : undefined,
    );

    if (get().generation !== generation) {
      if (forceFresh) throw new Error("Workspace session changed");
      return;
    }
    if (!result) {
      if (forceFresh) throw new Error("Fresh note request returned no note");
      return;
    }

    if ((noteWriteVersions.get(id) ?? 0) !== writeVersionAtStart) {
      if (forceFresh) throw new Error("Note changed during refresh");
      const currentNote = get().note;
      if (currentNote?.id === id) return currentNote;
      const latestCache = await noteCache.getItem(id);
      if (get().generation !== generation) return undefined;
      return latestCache ?? undefined;
    }

    const note = withDefaultContent(result);
    set({ note });
    await noteCache.setItem(id, note);
    if (get().generation !== generation) {
      await noteCache.removeItem(id);
      if (forceFresh) throw new Error("Workspace session changed");
      return undefined;
    }

    return note;
  },

  removeNote: async (id: string) => {
    const state = get();
    const { noteAPI, treeStore, generation, ownerUserId, sessionReady } = state;

    if (!noteAPI || !treeStore || !sessionReady) {
      console.warn("noteAPI or treeStore not initialized yet");
      return;
    }

    try {
      const result = await noteAPI.remove(id);
      if (!result?.success) throw new Error("Note deletion failed");
      if (ownerUserId) publishWorkspaceInvalidation(ownerUserId, "tree");
    } catch (error) {
      console.error("Error deleting note:", error);
      throw error;
    }

    if (get().generation !== generation) return;

    await noteCache.removeItem(id);
    if (get().generation !== generation) return;
    await treeStore.getState().removeItem(id);
    if (get().generation !== generation) return;
    set((currentState) => ({
      note: currentState.note?.id === id ? undefined : currentState.note,
    }));
  },

  mutateNote: async (id, payload) => {
    const state = get();
    const { noteAPI, treeStore, generation, ownerUserId, sessionReady } = state;

    if (!noteAPI || !treeStore || !sessionReady) {
      console.warn("noteAPI or treeStore not initialized yet");
      return;
    }

    let note = await noteCache.getItem(id);
    if (get().generation !== generation) return;
    if (!note && state.note?.id === id) {
      note = state.note;
      if (note) await noteCache.setItem(id, note);
      if (get().generation !== generation) {
        await noteCache.removeItem(id);
        return;
      }
    }
    if (!note) {
      try {
        const fetched = await noteAPI.find(id);
        if (get().generation !== generation) return;
        if (fetched) {
          note = fetched;
          await noteCache.setItem(id, fetched);
          if (get().generation !== generation) {
            await noteCache.removeItem(id);
            return;
          }
        }
      } catch {
        // The caller reports the missing note as an unsuccessful save below.
      }
    }

    // A reset clears the current generation's cache before allowing writes.
    // Requiring a current server/cache note stops an editor queued before Clear
    // Vault from sending a save after its pane has been removed.
    if (!note) throw new Error("Note not found");

    set((state) => ({
      note: state.note?.id === id ? { ...state.note, ...payload } : state.note,
    }));

    const mutationVersion = (noteWriteVersions.get(id) ?? 0) + 1;
    noteWriteVersions.set(id, mutationVersion);

    const result = await noteAPI.mutate(id, payload);
    if (result && ownerUserId && (payload.title !== undefined || payload.pinned !== undefined)) {
      publishWorkspaceInvalidation(ownerUserId, "tree");
    }

    if (get().generation !== generation) return;
    if ((noteWriteVersions.get(id) ?? 0) !== mutationVersion) return;

    if (!result) {
      set((currentState) => ({
        note:
          currentState.note?.id === id
            ? withDefaultContent(note)
            : currentState.note,
      }));
      throw new Error(noteAPI.error || "Failed to save note");
    }

    noteWriteVersions.set(id, mutationVersion + 1);

    const savedNote = withDefaultContent({ ...note, ...result });
    set((currentState) => ({
      note: currentState.note?.id === id ? savedNote : currentState.note,
    }));
    useSyncStatusStore.getState().markSynced(id);
    await noteCache.setItem(id, savedNote);
    if (get().generation !== generation) {
      await noteCache.removeItem(id);
      return;
    }
    await treeStore.getState().mutateItem(id, { data: savedNote });
    if (get().generation !== generation) return;
  },

  createNote: async (body) => {
    const state = get();
    const { noteAPI, treeStore, toast, generation, ownerUserId, sessionReady } =
      state;

    if (!noteAPI || !treeStore || !sessionReady) {
      console.warn("noteAPI or treeStore not initialized yet");
      return;
    }

    const result = await noteAPI.create(body);
    if (result && ownerUserId) publishWorkspaceInvalidation(ownerUserId, "tree");

    if (get().generation !== generation) return;
    if (!result) {
      toast?.(noteAPI.error || "Failed to create note", "error");
      return;
    }

    const note = withDefaultContent(result);
    await noteCache.setItem(note.id, note);
    if (get().generation !== generation) {
      await noteCache.removeItem(note.id);
      return undefined;
    }
    set({ note });
    treeStore.getState().addItem(note);

    useSyncStatusStore.getState().markNew(note.id);

    return note;
  },

  createFolder: async (parentId?: string) => {
    const state = get();
    const { noteAPI, treeStore, toast, generation, ownerUserId, sessionReady } =
      state;

    if (!noteAPI || !treeStore || !sessionReady) {
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
    if (result && ownerUserId) publishWorkspaceInvalidation(ownerUserId, "tree");

    if (get().generation !== generation) return;
    if (!result) {
      toast?.(noteAPI.error || "Failed to create folder", "error");
      return;
    }

    await noteCache.setItem(result.id, result);
    if (get().generation !== generation) {
      await noteCache.removeItem(result.id);
      return undefined;
    }
    treeStore.getState().addItem(result);

    useSyncStatusStore.getState().markNew(result.id);

    return result;
  },
}));

export default useNoteStore;
