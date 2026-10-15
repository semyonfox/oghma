// extracted from Notea (MIT License)
import { create } from "zustand";

interface PreviewState {
  anchor: Element | null;
  data?: { id?: string };
  visible: boolean;
  open: () => void;
  close: () => void;
  cancelClose: () => void;
  scheduleClose: (delayMs?: number) => void;
  setAnchor: (anchor: Element | null) => void;
  setData: (data?: { id?: string }) => void;
}

// the internal-link hover preview is the only floating portal left
interface PortalState {
  preview: PreviewState;
}

let previewCloseTimer: ReturnType<typeof setTimeout> | null = null;

function cancelPreviewClose() {
  if (previewCloseTimer) clearTimeout(previewCloseTimer);
  previewCloseTimer = null;
}

const usePortalStore = create<PortalState>((set) => ({
  preview: {
    anchor: null,
    visible: false,
    open: () => {
      cancelPreviewClose();
      set((state) => ({ preview: { ...state.preview, visible: true } }));
    },
    close: () => {
      cancelPreviewClose();
      set((state) => ({ preview: { ...state.preview, visible: false } }));
    },
    cancelClose: cancelPreviewClose,
    scheduleClose: (delayMs = 500) => {
      cancelPreviewClose();
      previewCloseTimer = setTimeout(() => {
        previewCloseTimer = null;
        set((state) => ({ preview: { ...state.preview, visible: false } }));
      }, delayMs);
    },
    setAnchor: (anchor) =>
      set((state) => ({ preview: { ...state.preview, anchor } })),
    setData: (data) =>
      set((state) => ({ preview: { ...state.preview, data } })),
  },
}));

export default usePortalStore;
