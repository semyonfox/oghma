// extracted from Notea (MIT License)
import { create } from 'zustand';
import { Settings } from '@/lib/notes/types/settings';
import useSettingsAPI from '@/lib/notes/api/settings';

interface SettingsStore {
    settings: Settings;
    setSettings: (settings: Settings) => void;
    updateSettings: (body: Partial<Settings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
    settings: {} as Settings,
    setSettings: (settings) => set({ settings }),
    updateSettings: async (body: Partial<Settings>) => {
        const { mutate } = useSettingsAPI();
        await mutate(body);
        set((state) => ({
            settings: {
                ...state.settings,
                ...body,
            },
        }));
    },
}));

export default useSettingsStore;
