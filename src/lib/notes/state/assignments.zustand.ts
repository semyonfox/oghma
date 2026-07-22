import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AssignmentType } from "@/lib/notes/utils/assignment-type";

export interface Assignment {
  id: string;
  canvas_course_id: number | null;
  title: string;
  description: string | null;
  course_name: string | null;
  course_color: string | null;
  due_at: string | null;
  status: "upcoming" | "in_progress" | "done" | "late";
  estimated_hours: number | null;
  logged_hours: number;
  source: "canvas" | "manual";
  assignment_type: AssignmentType;
  submitted_at: string | null;
  score: number | null;
  points_possible: number | null;
  created_at: string;
  updated_at: string;
}

export type AssignmentTab = "upcoming" | "done" | "late";

interface AssignmentState {
  assignments: Assignment[];
  loading: boolean;
  hasLoaded: boolean;
  error: string | null;
  courseFilter: string | null;
  activeTab: AssignmentTab;
  includeAll: boolean;
  includeArchived: boolean;

  fetchAssignments: (opts?: {
    all?: boolean;
    includeArchived?: boolean;
  }) => Promise<void>;
  createAssignment: (data: Partial<Assignment>) => Promise<Assignment | null>;
  updateAssignment: (
    id: string,
    data: Partial<Assignment>,
  ) => Promise<Assignment | null>;
  deleteAssignment: (id: string) => Promise<boolean>;
  syncFromCanvas: () => Promise<{ count: number } | null>;
  setCourseFilter: (course: string | null) => void;
  setActiveTab: (tab: AssignmentTab) => void;
  setIncludeAll: (all: boolean) => void;
  setIncludeArchived: (value: boolean) => Promise<void>;
}

let assignmentFetchSequence = 0;

const useAssignmentStore = create<AssignmentState>()(
  persist(
    (set, get) => ({
      assignments: [],
      loading: false,
      hasLoaded: false,
      error: null,
      courseFilter: null,
      activeTab: "upcoming",
      includeAll: false,
      includeArchived: false,

      fetchAssignments: async (opts) => {
        const requestSequence = ++assignmentFetchSequence;
        set({ loading: true, error: null });
        try {
          const all = opts?.all ?? get().includeAll;
          const includeArchived = opts?.includeArchived ?? get().includeArchived;
          const params = new URLSearchParams();
          if (all) params.set("all", "1");
          if (includeArchived) params.set("includeArchived", "1");
          const query = params.toString() ? `?${params.toString()}` : "";
          const res = await fetch(`/api/assignments${query}`);
          if (!res.ok) throw new Error("fetch failed");
          const data = await res.json();
          if (requestSequence !== assignmentFetchSequence) return;
          set({ assignments: data, loading: false, hasLoaded: true, error: null });
        } catch (error) {
          if (requestSequence !== assignmentFetchSequence) return;
          set({
            loading: false,
            hasLoaded: true,
            error: error instanceof Error ? error.message : "fetch failed",
          });
        }
      },

      createAssignment: async (data) => {
        try {
          const res = await fetch("/api/assignments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
          if (!res.ok) return null;
          const created = await res.json();
          set((s) => ({ assignments: [created, ...s.assignments] }));
          return created;
        } catch {
          return null;
        }
      },

      updateAssignment: async (id, data) => {
        try {
          const res = await fetch(`/api/assignments/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
          if (!res.ok) return null;
          const updated = await res.json();
          set((s) => ({
            assignments: s.assignments.map((a) => (a.id === id ? updated : a)),
          }));
          return updated;
        } catch {
          return null;
        }
      },

      deleteAssignment: async (id) => {
        try {
          const res = await fetch(`/api/assignments/${id}`, {
            method: "DELETE",
          });
          if (!res.ok) return false;
          set((s) => ({
            assignments: s.assignments.filter((a) => a.id !== id),
          }));
          return true;
        } catch {
          return false;
        }
      },

      syncFromCanvas: async () => {
        try {
          const res = await fetch("/api/assignments/sync", { method: "POST" });
          if (!res.ok) return null;
          const result = await res.json();
          // always re-fetch after sync to pick up any status changes
          await get().fetchAssignments();
          return result;
        } catch {
          return null;
        }
      },

      setCourseFilter: (course) => set({ courseFilter: course }),
      setActiveTab: (tab) => set({ activeTab: tab }),
      setIncludeAll: (all) => set({ includeAll: all }),
      setIncludeArchived: async (value) => {
        set({ includeArchived: value });
        await get().fetchAssignments({
          all: get().includeAll,
          includeArchived: value,
        });
      },
    }),
    {
      name: "oghma-assignments",
      partialize: (state) => ({
        courseFilter: state.courseFilter,
        activeTab: state.activeTab,
        includeAll: state.includeAll,
        includeArchived: state.includeArchived,
      }),
    },
  ),
);

export default useAssignmentStore;
