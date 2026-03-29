import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CalendarView = "month" | "week";

export interface TimeBlock {
  id: string;
  assignment_id: string | null;
  title: string | null;
  starts_at: string;
  ends_at: string;
  pomodoro_count: number;
  // joined from assignments
  assignment_title?: string;
  course_name?: string;
  course_color?: string;
}

interface CalendarState {
  view: CalendarView;
  currentDate: string; // ISO date string for serialization
  selectedDate: string | null;
  timeBlocks: TimeBlock[];
  loading: boolean;
  reviewDates: Set<string>;
  fetchReviewDates: (start: string, end: string) => Promise<void>;

  setView: (view: CalendarView) => void;
  navigateForward: () => void;
  navigateBack: () => void;
  goToToday: () => void;
  setSelectedDate: (date: string | null) => void;
  fetchTimeBlocks: (start: string, end: string) => Promise<void>;
  createTimeBlock: (block: {
    assignment_id?: string;
    title?: string;
    starts_at: string;
    ends_at: string;
  }) => Promise<TimeBlock | null>;
  updateTimeBlock: (id: string, data: Partial<TimeBlock>) => Promise<void>;
  deleteTimeBlock: (id: string) => Promise<void>;
}

function addMonths(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + n);
  return d.toISOString();
}

function addWeeks(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n * 7);
  return d.toISOString();
}

const useCalendarStore = create<CalendarState>()(
  persist(
    (set, get) => ({
      view: "month",
      currentDate: new Date().toISOString(),
      selectedDate: null,
      timeBlocks: [],
      loading: false,
      reviewDates: new Set<string>(),

      setView: (view) => set({ view }),

      navigateForward: () => {
        const { view, currentDate } = get();
        set({
          currentDate:
            view === "month"
              ? addMonths(currentDate, 1)
              : addWeeks(currentDate, 1),
        });
      },

      navigateBack: () => {
        const { view, currentDate } = get();
        set({
          currentDate:
            view === "month"
              ? addMonths(currentDate, -1)
              : addWeeks(currentDate, -1),
        });
      },

      goToToday: () => set({ currentDate: new Date().toISOString() }),

      setSelectedDate: (date) => set({ selectedDate: date }),

      fetchTimeBlocks: async (start, end) => {
        set({ loading: true });
        try {
          const res = await fetch(
            `/api/time-blocks?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
          );
          if (!res.ok) throw new Error("fetch failed");
          const data = await res.json();
          set({ timeBlocks: data, loading: false });
        } catch {
          set({ loading: false });
        }
      },

      createTimeBlock: async (block) => {
        try {
          const res = await fetch("/api/time-blocks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(block),
          });
          if (!res.ok) return null;
          const created = await res.json();
          set((s) => ({ timeBlocks: [...s.timeBlocks, created] }));
          return created;
        } catch {
          return null;
        }
      },

      updateTimeBlock: async (id, data) => {
        try {
          const res = await fetch(`/api/time-blocks/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
          if (!res.ok) return;
          const updated = await res.json();
          set((s) => ({
            timeBlocks: s.timeBlocks.map((b) => (b.id === id ? updated : b)),
          }));
        } catch {
          // silent
        }
      },

      deleteTimeBlock: async (id) => {
        try {
          const res = await fetch(`/api/time-blocks/${id}`, {
            method: "DELETE",
          });
          if (!res.ok) return;
          set((s) => ({
            timeBlocks: s.timeBlocks.filter((b) => b.id !== id),
          }));
        } catch {
          // silent
        }
      },

      fetchReviewDates: async (start, end) => {
        try {
          const res = await fetch(
            `/api/quiz/review-dates?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
          );
          if (!res.ok) return;
          const data = await res.json();
          set({ reviewDates: new Set(data.dates) });
        } catch {
          // silent
        }
      },
    }),
    {
      name: "oghma-calendar",
      partialize: (state) => ({
        view: state.view,
      }),
    },
  ),
);

export default useCalendarStore;
