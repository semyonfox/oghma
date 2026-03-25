import { create } from 'zustand';

interface SplitStore {
    sizes: [number, number];
    saveSizes: (newSizes: [number, number]) => Promise<void>;
    resize: (scale: number) => [number, number];
}

const normalizeSizes = (data: [number, number]): [number, number] => {
    if (!data || !Array.isArray(data) || data.length !== 2) {
        return [50, 50];
    }
    return data;
};

const postSplitSizes = (sizes: [number, number]) =>
    fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ split_sizes: sizes }),
    }).catch((err) => console.error('Failed to persist split sizes:', err));

const createSplitStore = (initData: [number, number] = [50, 50]) => {
    return create<SplitStore>((set, get) => ({
        sizes: normalizeSizes(initData),
        saveSizes: async (newSizes: [number, number]) => {
            if (!newSizes || !Array.isArray(newSizes) || newSizes.length !== 2) {
                console.warn('Invalid sizes provided. Using fallback sizes.');
                newSizes = [50, 50];
            }
            set({ sizes: newSizes });
            await postSplitSizes(newSizes);
        },
        resize: (scale: number) => {
            const { sizes } = get();
            const [size1] = sizes;
            const newSize1 = Math.max(0, Math.min(size1 * scale, 100));
            const newSize2 = Math.max(0, 100 - newSize1);
            const newSizes: [number, number] = [newSize1, newSize2];
            set({ sizes: newSizes });
            return newSizes;
        },
    }));
};

export default createSplitStore;
