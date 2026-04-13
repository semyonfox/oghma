import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CourseSetting {
  id: string;
  canvasCourseId: number;
  courseName: string;
  isActive: boolean;
  autoArchived: boolean;
  archivedAt: string | null;
}

interface CourseState {
  settings: CourseSetting[];
  loading: boolean;
  showArchived: boolean;

  fetchSettings: () => Promise<void>;
  archiveCourse: (courseId: number, courseName: string) => Promise<void>;
  unarchiveCourse: (courseId: number) => Promise<void>;
  toggleShowArchived: () => void;
  isCourseActive: (courseId: number) => boolean;
}

const useCourseStore = create<CourseState>()(
  persist(
    (set, get) => ({
      settings: [],
      loading: false,
      showArchived: false,

      fetchSettings: async () => {
        set({ loading: true });
        try {
          const res = await fetch("/api/courses/settings");
          if (!res.ok) throw new Error("fetch failed");
          const data = await res.json();
          set({ settings: data.settings, loading: false });
        } catch {
          set({ loading: false });
        }
      },

      archiveCourse: async (courseId: number, courseName: string) => {
        try {
          const res = await fetch("/api/courses/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              canvasCourseId: courseId,
              courseName,
              isActive: false,
            }),
          });
          if (!res.ok) return;
          const setting = await res.json();
          set((s) => ({
            settings: [
              ...s.settings.filter((st) => st.canvasCourseId !== courseId),
              setting,
            ],
          }));
        } catch {
          // silent
        }
      },

      unarchiveCourse: async (courseId: number) => {
        try {
          const res = await fetch(`/api/courses/settings/${courseId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: true }),
          });
          if (!res.ok) return;
          const setting = await res.json();
          set((s) => ({
            settings: [
              ...s.settings.filter((st) => st.canvasCourseId !== courseId),
              setting,
            ],
          }));
        } catch {
          // silent
        }
      },

      toggleShowArchived: () => set((s) => ({ showArchived: !s.showArchived })),

      isCourseActive: (courseId: number) => {
        const setting = get().settings.find(
          (s) => s.canvasCourseId === courseId
        );
        // If no setting exists, course is active by default
        return setting?.isActive ?? true;
      },
    }),
    {
      name: "oghma-courses",
      partialize: (state) => ({ showArchived: state.showArchived }),
    }
  )
);

export default useCourseStore;
