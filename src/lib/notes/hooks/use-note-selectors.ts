// State selector hooks for note data
// Uses memoization to prevent unnecessary re-renders when other parts of state change
import { useMemo } from 'react';
import useNoteStore from '@/lib/notes/state/note';

/**
 * Selects and memoizes the current note title
 * Re-renders only when title actually changes
 */
export const useNoteTitle = () => {
    const { note } = useNoteStore();
    return useMemo(() => note?.title || 'Untitled', [note?.title]);
};

/**
 * Selects and memoizes the current note ID
 * Re-renders only when ID changes
 */
export const useNoteId = () => {
    const { note } = useNoteStore();
    return useMemo(() => note?.id || null, [note?.id]);
};

/**
 * Selects and memoizes the current note content
 * Re-renders only when content changes
 */
export const useNoteContent = () => {
    const { note } = useNoteStore();
    return useMemo(() => note?.content || '', [note?.content]);
};

/**
 * Selects and memoizes the loading state
 * Re-renders only when loading status changes
 */
export const useIsLoading = () => {
    const { loading } = useNoteStore();
    return useMemo(() => loading, [loading]);
};
