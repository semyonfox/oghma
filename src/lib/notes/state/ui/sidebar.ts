// extracted from Notea (MIT License)
import { create } from 'zustand';
import useSettingsAPI from '@/lib/notes/api/settings';

interface SidebarStore {
    isFold: boolean;
    toggle: (state?: boolean) => Promise<void>;
    open: () => void;
    close: () => void;
}

const createSidebarStore = (initState = false, isMobileOnly = false) => {
    return create<SidebarStore>((set) => ({
        isFold: initState,
        toggle: async (state?: boolean) => {
            const { mutate } = useSettingsAPI();
            set((prev) => {
                const isFold = typeof state === 'boolean' ? state : !prev.isFold;
                if (!isMobileOnly) {
                    mutate({ sidebar_is_fold: isFold });
                }
                return { isFold };
            });
        },
        open: async () => {
            const { mutate } = useSettingsAPI();
            set(() => {
                if (!isMobileOnly) {
                    mutate({ sidebar_is_fold: true });
                }
                return { isFold: true };
            });
        },
        close: async () => {
            const { mutate } = useSettingsAPI();
            set(() => {
                if (!isMobileOnly) {
                    mutate({ sidebar_is_fold: false });
                }
                return { isFold: false };
            });
        },
    }));
};

export default createSidebarStore;
