import { useState, useCallback } from 'react';
import useSettingsAPI from '@/lib/notes/api/settings';

/**
 * A React hook to manage split pane sizes with persistent settings.
 */
export default function useSplit(initData: [number, number] = [50, 50]) {
    // State to store the current sizes
    const normalizeSizes = (data: [number, number]) => {
        if (!data || !Array.isArray(data) || data.length !== 2) {
            return [50, 50] as [number, number];
        }
        return data;
    };

    const [sizes, setSizes] = useState<[number, number]>(() => normalizeSizes(initData ?? [50, 50]));

    // Hook into settings API to persist changes
    const { mutate } = useSettingsAPI();

    // Function to save sizes to persistent storage
    const saveSizes = useCallback(
        async (newSizes: [number, number]) => {
            if (!newSizes || !Array.isArray(newSizes) || newSizes.length !== 2) {
                console.warn('Invalid sizes provided. Using fallback sizes.');
                newSizes = [50, 50];
            }
            setSizes(newSizes ?? [50, 50]);
            await mutate({
                split_sizes: (newSizes as [number, number]) ?? [50, 50],
            });
        },
        [mutate]
    );

    // Function to resize the split pane dynamically
    const resize = useCallback(
        (scale: number) => {
            const [size1, size2] = sizes ?? [50, 50];
            const newSize1 = Math.max(0, Math.min(size1 * scale, 100));
            const newSize2 = Math.max(0, 100 - newSize1);
            const newSizes: [number, number] = [newSize1, newSize2];
            setSizes(newSizes);
            return newSizes;
        },
        [sizes]
    );

    return {
        sizes,
        saveSizes,
        resize,
    };
}
