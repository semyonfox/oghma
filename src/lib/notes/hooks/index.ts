// Central export point for all custom hooks
// Organized by functionality

// State selector hooks - prevent unnecessary re-renders by selecting specific state slices
export { useNoteTitle, useNoteId, useNoteContent, useIsLoading } from './use-note-selectors';
export { useTreeItems, useTreeRoots, useItemCount } from './use-tree-selectors';
export { useSidebarOpen, useSidebarFolded, useSplitSizes } from './use-ui-selectors';

// Existing hooks (preserved for backward compatibility)
export { useEditContainer } from './use-edit-container';
export { useKeyboardShortcut } from './use-keyboard-shortcut';
export { default as useI18n } from './use-i18n';
export { useTreeOptions } from './use-tree-options';
export { useToast } from './use-toast';
export { default as useScrollView } from './use-scroll-view';
export { default as useMounted } from './use-mounted';
export { default as useDidUpdated } from './use-did-updated';
