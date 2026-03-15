// extracted from Notea (MIT License)
import { create } from 'zustand';
import { Settings } from '@/lib/notes/types/settings';

interface SettingsStore {
    settings: Settings;
    setSettings: (settings: Settings) => void;
    updateSettings: (body: Partial<Settings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
    settings: {} as Settings,
    setSettings: (settings) => set({ settings }),
    updateSettings: async (body: Partial<Settings>) => {
        await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        set((state) => ({
            settings: {
                ...state.settings,
                ...body,
            },
        }));
    },
}));

export default useSettingsStore;
