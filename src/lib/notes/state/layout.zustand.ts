import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type FileType = 'note' | 'pdf' | 'image' | 'video';
export type NavSection = 'notes' | 'search' | 'calendar' | 'quiz' | 'flashcards' | 'analytics' | 'settings';

interface PaneState {
  fileId: string;
  fileType: FileType;
  title?: string;
  sourcePath?: string;
  editMode?: boolean; // For notes only
  lastOpened?: number; // timestamp
}

export interface FileSpec extends PaneState {}

interface LayoutState {
  // Navigation
  activeNav: NavSection;

  // Pane state (A is required, B is optional)
  paneA: PaneState;
  paneB: PaneState | null;
  activePane: 'A' | 'B'; // Track which pane has focus for keyboard shortcuts

  // Right panel
  rightPanelOpen: boolean;

  // UI sizes (persist to localStorage)
  treeWidth: number; // 200-600px
  rightPanelWidth: number; // 250-400px
  splitPosition: number; // 0-100 between panes (%)

  // Tree state
  expandedNodes: Set<string>;
  collapsedSections: Set<string>; // Notes, Documents, Media, Tags
  selectedNode: string | null;

  // Drag state
  draggedFile: FileSpec | null;

  // Methods
  setActiveNav: (nav: NavSection) => void;
  setPaneA: (file: FileSpec | undefined) => void;
  setPaneB: (file: FileSpec | undefined) => void;
  setActivePane: (pane: 'A' | 'B') => void;
  swapPanes: () => void;
  setPaneEditMode: (pane: 'A' | 'B', editMode: boolean) => void;
  setRightPanelOpen: (open: boolean) => void;
  toggleRightPanel: () => void;
  setSizes: (tree: number, right: number, split: number) => void;
  toggleExpandedNode: (nodeId: string) => void;
  toggleCollapsedSection: (section: string) => void;
  setSelectedNode: (nodeId: string | null) => void;
  setDraggedFile: (file: FileSpec | null) => void;
}

const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      // Initial state
      activeNav: 'notes',
      paneA: { fileId: '', fileType: 'note' as FileType },
      paneB: null,
      activePane: 'A',
      rightPanelOpen: true,
      treeWidth: 250,
      rightPanelWidth: 300,
      splitPosition: 50,
       expandedNodes: new Set(['root']),
       collapsedSections: new Set(),
       selectedNode: null,
       draggedFile: null,

      // Navigation
      setActiveNav: (nav) => set({ activeNav: nav }),

      // Pane A (required)
      setPaneA: (file) => {
        set(() => ({
          paneA: file || { fileId: '', fileType: 'note' as FileType },
          selectedNode: file?.fileId || null,
        }));
      },

      // Pane B (optional)
      setPaneB: (file) => {
        if (!file) {
          set({ paneB: null });
        } else {
          set({ paneB: { ...file, lastOpened: Date.now() } });
        }
      },

      // Set active pane (for keyboard focus tracking)
      setActivePane: (pane) => set({ activePane: pane }),

      // Swap panes
      swapPanes: () => {
        set((state) => ({
          paneA: state.paneB || state.paneA,
          paneB: state.paneA,
        }));
      },

      // Edit mode (for notes)
      setPaneEditMode: (pane, editMode) => {
        set((state) => {
          if (pane === 'A') {
            return {
              paneA: { ...state.paneA, editMode },
            };
          } else {
            return {
              paneB: state.paneB ? { ...state.paneB, editMode } : null,
            };
          }
        });
      },

      // Right panel
      setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
      toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),

      // Sizes
      setSizes: (tree, right, split) => {
        set({
          treeWidth: Math.max(200, Math.min(600, tree)),
          rightPanelWidth: Math.max(250, Math.min(400, right)),
          splitPosition: Math.max(0, Math.min(100, split)),
        });
      },

      // Tree state
      toggleExpandedNode: (nodeId) => {
        set((state) => {
          const newExpanded = new Set(state.expandedNodes);
          if (newExpanded.has(nodeId)) {
            newExpanded.delete(nodeId);
          } else {
            newExpanded.add(nodeId);
          }
          return { expandedNodes: newExpanded };
        });
      },

      toggleCollapsedSection: (section) => {
        set((state) => {
          const newCollapsed = new Set(state.collapsedSections);
          if (newCollapsed.has(section)) {
            newCollapsed.delete(section);
          } else {
            newCollapsed.add(section);
          }
          return { collapsedSections: newCollapsed };
        });
      },

      setSelectedNode: (nodeId) => set({ selectedNode: nodeId }),

      setDraggedFile: (file) => set({ draggedFile: file }),
    }),
    {
      name: 'oghmaNotes-layout-store',
      partialize: (state) => ({
        treeWidth: state.treeWidth,
        rightPanelWidth: state.rightPanelWidth,
        splitPosition: state.splitPosition,
        collapsedSections: Array.from(state.collapsedSections),
        expandedNodes: Array.from(state.expandedNodes),
      }),
      merge: (persistedState: any, currentState) => ({
        ...currentState,
        ...(persistedState as any),
        collapsedSections: new Set(persistedState?.collapsedSections || []),
        expandedNodes: new Set(persistedState?.expandedNodes || ['root']),
      }),
    }
  )
);

export default useLayoutStore;
