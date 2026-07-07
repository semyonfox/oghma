"use client";

import { create } from "zustand";

interface GlobalSearchState {
  visible: boolean;
  open: () => void;
  close: () => void;
}

const useGlobalSearchStore = create<GlobalSearchState>((set) => ({
  visible: false,
  open: () => set({ visible: true }),
  close: () => set({ visible: false }),
}));

export default useGlobalSearchStore;
