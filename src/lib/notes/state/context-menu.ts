import { create } from "zustand";

interface ContextMenuState {
  openMenuId: string | null;
  position: { x: number; y: number };
  isFolder: boolean;
  isPinned: boolean;
  selectedCount: number;
  selectionIds: string[];
  setOpenMenu: (
    id: string,
    x: number,
    y: number,
    isFolder: boolean,
    isPinned: boolean,
    selectionIds?: string[],
  ) => void;
  closeMenu: () => void;
}

const useContextMenuStore = create<ContextMenuState>((set) => ({
  openMenuId: null,
  position: { x: 0, y: 0 },
  isFolder: false,
  isPinned: false,
  selectedCount: 0,
  selectionIds: [],
  setOpenMenu: (id, x, y, isFolder, isPinned, selectionIds = [id]) =>
    set({
      openMenuId: id,
      position: { x, y },
      isFolder,
      isPinned,
      selectionIds,
      selectedCount: selectionIds.length,
    }),
  closeMenu: () =>
    set({ openMenuId: null, selectionIds: [], selectedCount: 0 }),
}));

export default useContextMenuStore;
