import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Assignment {
  id: string;
  title: string;
  description: string | null;
  course_name: string | null;
  course_color: string | null;
  due_at: string | null;
  status: "upcoming" | "in_progress" | "done" | "late";
  estimated_hours: number | null;
  logged_hours: number;
  source: "canvas" | "manual";
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
  courseFilter: string | null;
  activeTab: AssignmentTab;
  includeAll: boolean;

  fetchAssignments: (opts?: {
    all?: boolean;
    includeArchived?: boolean;
  }) => Promise<void>;
  createAssignment: (data: Partial<Assignment>) => Promise<Assignment | null>;
  updateAssignment: (id: string, data: Partial<Assignment>) => Promise<void>;
  deleteAssignment: (id: string) => Promise<void>;
  syncFromCanvas: () => Promise<{ count: number } | null>;
  setCourseFilter: (course: string | null) => void;
  setActiveTab: (tab: AssignmentTab) => void;
  setIncludeAll: (all: boolean) => void;
}

const useAssignmentStore = create<AssignmentState>()(
  persist(
    (set, get) => ({
      assignments: [],
      loading: false,
      courseFilter: null,
      activeTab: "upcoming",
      includeAll: false,

      fetchAssignments: async (opts) => {
        set({ loading: true });
        try {
          const all = opts?.all ?? get().includeAll;
          const includeArchived = opts?.includeArchived;
          const params = new URLSearchParams();
          if (all) params.set("all", "1");
          if (includeArchived) params.set("includeArchived", "1");
          const query = params.toString() ? `?${params.toString()}` : "";
          const res = await fetch(`/api/assignments${query}`);
          if (!res.ok) throw new Error("fetch failed");
          const data = await res.json();
          set({ assignments: data, loading: false });
        } catch {
          set({ loading: false });
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
          if (!res.ok) return;
          const updated = await res.json();
          set((s) => ({
            assignments: s.assignments.map((a) => (a.id === id ? updated : a)),
          }));
        } catch {
          // silent
        }
      },

      deleteAssignment: async (id) => {
        try {
          const res = await fetch(`/api/assignments/${id}`, {
            method: "DELETE",
          });
          if (!res.ok) return;
          set((s) => ({
            assignments: s.assignments.filter((a) => a.id !== id),
          }));
        } catch {
          // silent
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
    }),
    {
      name: "oghma-assignments",
      partialize: (state) => ({
        courseFilter: state.courseFilter,
        activeTab: state.activeTab,
        includeAll: state.includeAll,
      }),
    },
  ),
);

export default useAssignmentStore;
