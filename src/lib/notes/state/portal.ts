// extracted from Notea (MIT License)
import { create } from "zustand";
import { NoteModel } from "@/lib/notes/types/note";

interface ModalInstance {
  visible: boolean;
  open: () => void;
  close: () => void;
}

interface AnchorInstance<T> {
  anchor: Element | null;
  data?: T;
  visible: boolean;
  open: () => void;
  close: () => void;
  setAnchor: (anchor: Element | null) => void;
  setData: (data?: T) => void;
}

interface PortalState {
  search: ModalInstance;
  trash: ModalInstance;
  menu: AnchorInstance<NoteModel>;
  share: AnchorInstance<NoteModel>;
  preview: AnchorInstance<{ id?: string }>;
  linkToolbar: AnchorInstance<{ href: string; view?: any }>;
}

const usePortalStore = create<PortalState>((set) => ({
  search: {
    visible: false,
    open: () =>
      set((state) => ({ search: { ...state.search, visible: true } })),
    close: () =>
      set((state) => ({ search: { ...state.search, visible: false } })),
  },
  trash: {
    visible: false,
    open: () => set((state) => ({ trash: { ...state.trash, visible: true } })),
    close: () =>
      set((state) => ({ trash: { ...state.trash, visible: false } })),
  },
  menu: {
    anchor: null,
    visible: false,
    open: () => set((state) => ({ menu: { ...state.menu, visible: true } })),
    close: () => set((state) => ({ menu: { ...state.menu, visible: false } })),
    setAnchor: (anchor) =>
      set((state) => ({ menu: { ...state.menu, anchor } })),
    setData: (data) => set((state) => ({ menu: { ...state.menu, data } })),
  },
  share: {
    anchor: null,
    visible: false,
    open: () => set((state) => ({ share: { ...state.share, visible: true } })),
    close: () =>
      set((state) => ({ share: { ...state.share, visible: false } })),
    setAnchor: (anchor) =>
      set((state) => ({ share: { ...state.share, anchor } })),
    setData: (data) => set((state) => ({ share: { ...state.share, data } })),
  },
  preview: {
    anchor: null,
    visible: false,
    open: () =>
      set((state) => ({ preview: { ...state.preview, visible: true } })),
    close: () =>
      set((state) => ({ preview: { ...state.preview, visible: false } })),
    setAnchor: (anchor) =>
      set((state) => ({ preview: { ...state.preview, anchor } })),
    setData: (data) =>
      set((state) => ({ preview: { ...state.preview, data } })),
  },
  linkToolbar: {
    anchor: null,
    visible: false,
    open: () =>
      set((state) => ({
        linkToolbar: { ...state.linkToolbar, visible: true },
      })),
    close: () =>
      set((state) => ({
        linkToolbar: { ...state.linkToolbar, visible: false },
      })),
    setAnchor: (anchor) =>
      set((state) => ({ linkToolbar: { ...state.linkToolbar, anchor } })),
    setData: (data) =>
      set((state) => ({ linkToolbar: { ...state.linkToolbar, data } })),
  },
}));

export default usePortalStore;
