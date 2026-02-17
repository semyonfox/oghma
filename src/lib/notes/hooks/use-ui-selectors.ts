// State selector hooks for UI state
// Uses memoization to prevent unnecessary re-renders when other parts of state change
import { useMemo } from 'react';
import UIState from '@/lib/notes/state/ui';

/**
 * Selects and memoizes the sidebar folded state
 * Re-renders only when fold state changes
 */
export const useSidebarFolded = () => {
    const { sidebar } = UIState.useContainer();
    return useMemo(() => sidebar.isFold, [sidebar.isFold]);
};

/**
 * Selects and memoizes the inverted sidebar open state
 * Re-renders only when fold state changes
 */
export const useSidebarOpen = () => {
    const { sidebar } = UIState.useContainer();
    return useMemo(() => !sidebar.isFold, [sidebar.isFold]);
};

/**
 * Selects and memoizes the split pane sizes
 * Re-renders only when sizes actually change
 */
export const useSplitSizes = () => {
    const { split } = UIState.useContainer();
    return useMemo(() => split.sizes, [split.sizes]);
};
