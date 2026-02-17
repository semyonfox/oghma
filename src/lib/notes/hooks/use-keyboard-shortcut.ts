'use client';

import { useEffect, useRef, useCallback } from 'react';

interface UseKeyboardShortcutOptions {
    onSave?: () => void | Promise<void>;
    enabled?: boolean;
}

interface ShortcutConfig {
    key: string;
    ctrl?: boolean;
    shift?: boolean;
    meta?: boolean;
    handler: (event: KeyboardEvent) => void;
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

/**
 * Enhanced hook to register custom keyboard shortcuts
 * Platform-aware: translates Meta to Cmd on Mac, Ctrl on Windows
 */
export function useShortcut(config: ShortcutConfig) {
    const { key, ctrl = false, shift = false, meta = false, handler } = config;

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const isMacOS = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
            const metaKey = isMacOS ? event.metaKey : event.ctrlKey;

            const matchesKey = event.key.toLowerCase() === key.toLowerCase();
            const matchesCtrl = ctrl === event.ctrlKey;
            const matchesShift = shift === event.shiftKey;
            const matchesMeta = meta === metaKey;

            if (matchesKey && matchesCtrl && matchesShift && matchesMeta) {
                event.preventDefault();
                event.stopPropagation();
                handler(event);
            }
        };

        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [key, ctrl, shift, meta, handler]);
}
