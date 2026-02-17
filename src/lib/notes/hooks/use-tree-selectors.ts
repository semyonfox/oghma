// State selector hooks for tree/note hierarchy data
// Uses memoization to prevent unnecessary re-renders when other parts of state change
import { useMemo } from 'react';
import NoteTreeState from '@/lib/notes/state/tree';

/**
 * Selects and memoizes all tree items (the complete items map)
 * Re-renders only when the items object itself changes
 */
export const useTreeItems = () => {
    const { tree } = NoteTreeState.useContainer();
    return useMemo(() => tree.items, [tree.items]);
};

/**
 * Selects and memoizes root-level tree items
 * Re-renders only when root items change
 */
export const useTreeRoots = () => {
    const { tree } = NoteTreeState.useContainer();
    return useMemo(() => {
        const rootItem = tree.items[tree.rootId];
        if (!rootItem) return [];
        return rootItem.children.map(id => tree.items[id]).filter(Boolean);
    }, [tree.items, tree.rootId]);
};

/**
 * Selects and memoizes the total count of items in the tree
 * Re-renders only when item count changes
 */
export const useItemCount = () => {
    const { tree } = NoteTreeState.useContainer();
    return useMemo(() => {
        return Object.keys(tree.items).length;
    }, [tree.items]);
};
