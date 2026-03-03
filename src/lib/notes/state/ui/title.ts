// extracted from Notea (MIT License)
import { create } from 'zustand';

interface TitleStore {
    value: string;
    updateTitle: (text?: string) => void;
}

export const useTitleStore = create<TitleStore>((set) => ({
    value: 'OghmaNotes',
    updateTitle: (text?: string) => {
        set({ value: text ? `${text} - OghmaNotes` : 'OghmaNotes' });
    },
}));

export default useTitleStore;
