import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CourseSetting {
  id: string;
  canvasCourseId: string;
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
  archiveCourse: (courseId: string, courseName: string) => Promise<void>;
  unarchiveCourse: (courseId: string) => Promise<void>;
  toggleShowArchived: () => void;
  isCourseActive: (courseId: string) => boolean;
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
          throw new Error("fetch failed");
        }
      },

      archiveCourse: async (courseId: string, courseName: string) => {
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
          if (!res.ok) throw new Error("archive failed");
          const setting = await res.json();
          set((s) => ({
            settings: [
              ...s.settings.filter((st) => st.canvasCourseId !== courseId),
              setting,
            ],
          }));
        } catch {
          throw new Error("archive failed");
        }
      },

      unarchiveCourse: async (courseId: string) => {
        try {
          const res = await fetch(`/api/courses/settings/${courseId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: true }),
          });
          if (!res.ok) throw new Error("unarchive failed");
          const setting = await res.json();
          set((s) => ({
            settings: [
              ...s.settings.filter((st) => st.canvasCourseId !== courseId),
              setting,
            ],
          }));
        } catch {
          throw new Error("unarchive failed");
        }
      },

      toggleShowArchived: () => set((s) => ({ showArchived: !s.showArchived })),

      isCourseActive: (courseId: string) => {
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
