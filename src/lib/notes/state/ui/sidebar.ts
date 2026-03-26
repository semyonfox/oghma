// extracted from Notea (MIT License)
import { create } from 'zustand';

interface SidebarStore {
    isFold: boolean;
    toggle: (state?: boolean) => Promise<void>;
    open: () => void;
    close: () => void;
}

const postSidebarSetting = (isFold: boolean) =>
    fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sidebar_is_fold: isFold }),
    }).catch((err) => console.error('Failed to persist sidebar state:', err));

const createSidebarStore = (initState = false, isMobileOnly = false) => {
    return create<SidebarStore>((set) => ({
        isFold: initState,
        toggle: async (state?: boolean) => {
            set((prev) => {
                const isFold = typeof state === 'boolean' ? state : !prev.isFold;
                if (!isMobileOnly) {
                    postSidebarSetting(isFold);
                }
                return { isFold };
            });
        },
        open: async () => {
            set(() => {
                if (!isMobileOnly) {
                    postSidebarSetting(true);
                }
                return { isFold: true };
            });
        },
        close: async () => {
            set(() => {
                if (!isMobileOnly) {
                    postSidebarSetting(false);
                }
                return { isFold: false };
            });
        },
    }));
};

export default createSidebarStore;
