import { create } from 'zustand';

interface ContextMenuState {
  openMenuId: string | null;
  position: { x: number; y: number };
  isFolder: boolean;
  isPinned: boolean;
  setOpenMenu: (id: string, x: number, y: number, isFolder: boolean, isPinned: boolean) => void;
  closeMenu: () => void;
}

const useContextMenuStore = create<ContextMenuState>((set) => ({
  openMenuId: null,
  position: { x: 0, y: 0 },
  isFolder: false,
  isPinned: false,
  setOpenMenu: (id, x, y, isFolder, isPinned) => set({ openMenuId: id, position: { x, y }, isFolder, isPinned }),
  closeMenu: () => set({ openMenuId: null }),
}));

export default useContextMenuStore;
