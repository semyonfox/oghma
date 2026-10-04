// save state for the note currently being edited, keyed by file rather than by
// pane. keying by file means pane swaps need no synchronisation here — the
// indicator travels with the note automatically.
import { create } from "zustand";

export type SaveState = "saved" | "dirty" | "saving" | "error";

export interface FileSaveIndicator {
    state: SaveState;
    ready?: boolean;
    save: () => void;
}

export function saveIndicatorKey(fileId: string, owner: "A" | "B" = "A"): string {
    return owner === "A" ? fileId : `${fileId}:B`;
}

interface SaveIndicatorState {
    files: Record<string, FileSaveIndicator>;
    setIndicator: (fileId: string, indicator: FileSaveIndicator) => void;
    clearIndicator: (fileId: string) => void;
}

const useSaveIndicatorStore = create<SaveIndicatorState>((set) => ({
    files: {},

    setIndicator: (fileId, indicator) => {
        set((state) => {
            const current = state.files[fileId];
            if (
                current &&
                current.state === indicator.state &&
                current.ready === indicator.ready &&
                current.save === indicator.save
            ) {
                return state;
            }
            return { files: { ...state.files, [fileId]: indicator } };
        });
    },

    clearIndicator: (fileId) => {
        set((state) => {
            if (!(fileId in state.files)) return state;
            const next = { ...state.files };
            delete next[fileId];
            return { files: next };
        });
    },
}));

export default useSaveIndicatorStore;
