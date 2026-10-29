import { create } from "zustand";

/** one file the tag popover edits */
export interface TagTarget {
  /** the tree or Tags view row */
  id: string;
  title: string;
  /** what study maps know it as. a PDF bundle uses its PDF, which pairs with its note */
  materialId: string;
  /** where #tags are written. null for a PDF with no extracted note */
  noteId: string | null;
  /** top-level folder it sits in. topics are only edited in bulk inside one course */
  courseId: string | null;
}

interface TagEditorState {
  targets: TagTarget[];
  anchor: { x: number; y: number } | null;
  open: (targets: TagTarget[], anchor: { x: number; y: number } | null) => void;
  close: () => void;
}

const useTagEditorStore = create<TagEditorState>((set) => ({
  targets: [],
  anchor: null,
  open: (targets, anchor) => set({ targets, anchor }),
  close: () => set({ targets: [], anchor: null }),
}));

export default useTagEditorStore;
