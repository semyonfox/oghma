import { create } from "zustand";
import { persist } from "zustand/middleware";

export type FileType = "note" | "pdf" | "image" | "video";
export type NavSection =
  "notes" | "search" | "calendar" | "chat" | "quiz" | "settings";
export type RightPanelTab = "meta" | "ai" | "tasks";
export type PaneId = "A" | "B";

interface PaneState {
  fileId: string;
  fileType: FileType;
  title?: string;
  sourcePath?: string;
  editMode?: boolean; // For notes only
  lastOpened?: number; // timestamp
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFileType(value: unknown): value is FileType {
  return value === "note" || value === "pdf" || value === "image" || value === "video";
}

function isPaneState(value: unknown): value is PaneState {
  if (!isRecord(value)) return false;
  return (
    typeof value.fileId === "string" &&
    isFileType(value.fileType) &&
    (value.title === undefined || typeof value.title === "string") &&
    (value.sourcePath === undefined || typeof value.sourcePath === "string") &&
    (value.editMode === undefined || typeof value.editMode === "boolean") &&
    (value.lastOpened === undefined || typeof value.lastOpened === "number")
  );
}

function stringSet(value: unknown, fallback: string[]): Set<string> {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? new Set(value)
    : new Set(fallback);
}

export interface FileSpec extends PaneState {}

interface LayoutState {
  // Navigation
  activeNav: NavSection;

  // Pane state (A is required, B is optional)
  paneA: PaneState;
  paneB: PaneState | null;
  activePane: "A" | "B"; // Track which pane has focus for keyboard shortcuts

  // Right panel
  rightPanelOpen: boolean;
  rightPanelTab: RightPanelTab;

  // UI sizes (persist to localStorage)
  treeWidth: number; // 200-600px
  rightPanelWidth: number; // 250-600px
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
  placeFileInPane: (file: FileSpec, target: PaneId, source?: PaneId) => void;
  dismissUnavailablePane: (
    pane: "A" | "B",
    fileId: string,
  ) => FileSpec | null | undefined;
  setActivePane: (pane: "A" | "B") => void;
  swapPanes: () => void;
  setPaneEditMode: (pane: "A" | "B", editMode: boolean) => void;
  setRightPanelOpen: (open: boolean) => void;
  toggleRightPanel: () => void;
  setRightPanelTab: (tab: RightPanelTab) => void;
  openRightPanelTab: (tab: RightPanelTab) => void;
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
      activeNav: "notes",
      paneA: { fileId: "", fileType: "note" as FileType },
      paneB: null,
      activePane: "A",
      rightPanelOpen: false,
      rightPanelTab: "meta",
      treeWidth: 240,
      rightPanelWidth: 280,
      splitPosition: 50,
      expandedNodes: new Set(["root"]),
      collapsedSections: new Set(),
      selectedNode: null,
      draggedFile: null,

      // Navigation
      setActiveNav: (nav) => set({ activeNav: nav }),

      // Pane A (required)
      setPaneA: (file) => {
        set(() => ({
          paneA: file || { fileId: "", fileType: "note" as FileType },
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

      // Place tree files or move open files in one state update. Pane-to-pane
      // moves swap the two files so neither editor is briefly overwritten.
      placeFileInPane: (file, target, source) => {
        set((state) => {
          if (source === target) {
            return {
              activePane: target,
              selectedNode: file.fileId,
            };
          }

          if (source) {
            const sourceFile = source === "A" ? state.paneA : state.paneB;
            if (!sourceFile || sourceFile.fileId !== file.fileId) return state;

            // A lone primary pane cannot be moved into an empty secondary pane.
            // Files from the tree can still be dropped there to create the split.
            if (source === "A" && target === "B" && !state.paneB) return state;

            return {
              paneA: state.paneB || state.paneA,
              paneB: state.paneA,
              activePane: target,
              selectedNode: file.fileId,
            };
          }

          if (target === "A") {
            return {
              paneA: file,
              activePane: "A",
              selectedNode: file.fileId,
            };
          }

          return {
            paneB: { ...file, lastOpened: Date.now() },
            activePane: "B",
            selectedNode: file.fileId,
          };
        });
      },

      // Remove a file only if the failed request still belongs to that pane.
      // When pane A disappears, promote pane B so the surviving editor remains
      // usable and the URL can follow it without remounting stale pane state.
      dismissUnavailablePane: (pane, fileId) => {
        let survivingFile: FileSpec | null | undefined;

        set((state) => {
          const currentFile = pane === "A" ? state.paneA : state.paneB;
          if (!currentFile || currentFile.fileId !== fileId) {
            survivingFile = undefined;
            return state;
          }

          if (pane === "B") {
            survivingFile = state.paneA.fileId ? state.paneA : null;
            return {
              paneB: null,
              activePane: "A",
              selectedNode: state.paneA.fileId || null,
            };
          }

          const promoted = state.paneB;
          survivingFile = promoted;
          return {
            paneA: promoted || { fileId: "", fileType: "note" as FileType },
            paneB: null,
            activePane: "A",
            selectedNode: promoted?.fileId || null,
          };
        });

        return survivingFile;
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
          if (pane === "A") {
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
      toggleRightPanel: () =>
        set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
      setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
      openRightPanelTab: (tab) =>
        set((state) => ({
          rightPanelOpen:
            state.rightPanelOpen && state.rightPanelTab === tab ? false : true,
          rightPanelTab: tab,
        })),

      // Sizes
      setSizes: (tree, right, split) => {
        set({
          treeWidth: Math.max(200, Math.min(600, tree)),
          rightPanelWidth: Math.max(250, Math.min(600, right)),
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
      name: "oghmaNotes-layout-store",
      partialize: (state) => ({
        treeWidth: state.treeWidth,
        rightPanelWidth: state.rightPanelWidth,
        splitPosition: state.splitPosition,
        collapsedSections: Array.from(state.collapsedSections),
        expandedNodes: Array.from(state.expandedNodes),
        paneA: state.paneA,
        paneB: state.paneB,
      }),
      merge: (persistedState, currentState) => {
        if (!isRecord(persistedState)) return currentState;

        return {
          ...currentState,
          treeWidth:
            typeof persistedState.treeWidth === "number"
              ? persistedState.treeWidth
              : currentState.treeWidth,
          rightPanelWidth:
            typeof persistedState.rightPanelWidth === "number"
              ? persistedState.rightPanelWidth
              : currentState.rightPanelWidth,
          splitPosition:
            typeof persistedState.splitPosition === "number"
              ? persistedState.splitPosition
              : currentState.splitPosition,
          collapsedSections: stringSet(persistedState.collapsedSections, []),
          expandedNodes: stringSet(persistedState.expandedNodes, ["root"]),
          paneA: isPaneState(persistedState.paneA)
            ? persistedState.paneA
            : currentState.paneA,
          paneB:
            persistedState.paneB === null || isPaneState(persistedState.paneB)
              ? persistedState.paneB
              : null,
        };
      },
    },
  ),
);

export default useLayoutStore;
