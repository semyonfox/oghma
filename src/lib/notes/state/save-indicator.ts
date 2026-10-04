// per-pane save state so the pane header (filename bar) can own the save
// affordance instead of floating a button over the editor toolbar
import { create } from "zustand";

export type SaveState = "saved" | "dirty" | "saving" | "error";

export interface PaneSaveIndicator {
    fileId: string;
    state: SaveState;
    save: () => void;
}

interface SaveIndicatorState {
    panes: Partial<Record<"A" | "B", PaneSaveIndicator>>;
    setIndicator: (pane: "A" | "B", indicator: PaneSaveIndicator) => void;
    clearIndicator: (pane: "A" | "B", fileId: string) => void;
    swapPanes: () => void;
}

const useSaveIndicatorStore = create<SaveIndicatorState>((set) => ({
    panes: {},

    setIndicator: (pane, indicator) => {
        set((state) => {
            const current = state.panes[pane];
            if (
                current &&
                current.fileId === indicator.fileId &&
                current.state === indicator.state &&
                current.save === indicator.save
            ) {
                return state;
            }
            return { panes: { ...state.panes, [pane]: indicator } };
        });
    },

    // only clear if the pane still holds the file that is unmounting
    clearIndicator: (pane, fileId) => {
        set((state) => {
            if (state.panes[pane]?.fileId !== fileId) return state;
            const next = { ...state.panes };
            delete next[pane];
            return { panes: next };
        });
    },

    swapPanes: () => {
        set((state) => ({ panes: { A: state.panes.B, B: state.panes.A } }));
    },
}));

export default useSaveIndicatorStore;
