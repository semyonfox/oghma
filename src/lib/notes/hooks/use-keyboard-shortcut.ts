'use client';

import { useEffect, useRef, useCallback } from 'react';

interface UseKeyboardShortcutOptions {
    onSave?: () => void | Promise<void>;
    enabled?: boolean;
}

/**
 * Hook to handle keyboard shortcuts, particularly Ctrl/Cmd+S for saving
 * Prevents default browser save behavior
 */
export function useKeyboardShortcut({ onSave, enabled = true }: UseKeyboardShortcutOptions) {
    const isProcessingRef = useRef(false);

    const handleKeyDown = useCallback(
        async (e: KeyboardEvent) => {
            // Ctrl+S or Cmd+S (Mac)
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                e.stopPropagation();

                if (!enabled || !onSave || isProcessingRef.current) {
                    return;
                }

                isProcessingRef.current = true;
                try {
                    await onSave();
                } finally {
                    isProcessingRef.current = false;
                }
            }
        },
        [onSave, enabled]
    );

    useEffect(() => {
        if (!enabled) return;

        document.addEventListener('keydown', handleKeyDown, true);

        return () => {
            document.removeEventListener('keydown', handleKeyDown, true);
        };
    }, [handleKeyDown, enabled]);
}
