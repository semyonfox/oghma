import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  addDaysToDateKey,
  addMonthsToDateKey,
  formatDateKey,
  parseLocalDateKey,
} from "@/lib/notes/utils/calendar-date";

export type CalendarView = "month" | "week";

export interface TimeBlock {
  id: string;
  assignment_id: string | null;
  title: string | null;
  starts_at: string;
  ends_at: string;
  pomodoro_count: number;
  completed: boolean;
  assignment_title?: string;
  course_name?: string;
  course_color?: string;
}

interface CalendarState {
  view: CalendarView;
  currentDate: string;
  selectedDate: string;
  timeBlocks: TimeBlock[];
  loading: boolean;
  error: string | null;
  reviewDates: Set<string>;
  reviewDatesLoading: boolean;
  reviewDatesError: string | null;

  setView: (view: CalendarView) => void;
  navigateForward: () => void;
  navigateBack: () => void;
  goToToday: () => void;
  setSelectedDate: (date: string) => void;
  fetchTimeBlocks: (start: string, end: string) => Promise<void>;
  fetchReviewDates: (start: string, end: string) => Promise<void>;
  createTimeBlock: (block: {
    assignment_id?: string;
    title?: string;
    starts_at: string;
    ends_at: string;
  }) => Promise<TimeBlock | null>;
  updateTimeBlock: (
    id: string,
    data: Partial<TimeBlock>,
  ) => Promise<TimeBlock | null>;
  toggleTimeBlockCompleted: (id: string) => Promise<boolean>;
  deleteTimeBlock: (id: string) => Promise<boolean>;
}

let timeBlockFetchSequence = 0;
let reviewDateFetchSequence = 0;

function anchorIso(dateKey: string): string {
  const date = parseLocalDateKey(dateKey);
  if (!date) return new Date().toISOString();
  date.setHours(12, 0, 0, 0);
  return date.toISOString();
}

function movedDate(
  dateKey: string,
  view: CalendarView,
  direction: -1 | 1,
): string {
  return view === "month"
    ? addMonthsToDateKey(dateKey, direction)
    : addDaysToDateKey(dateKey, direction * 7);
}

const today = formatDateKey(new Date());

const useCalendarStore = create<CalendarState>()(
  persist(
    (set, get) => ({
      view: "month",
      currentDate: anchorIso(today),
      selectedDate: today,
      timeBlocks: [],
      loading: false,
      error: null,
      reviewDates: new Set<string>(),
      reviewDatesLoading: false,
      reviewDatesError: null,

      setView: (view) => set({ view }),

      navigateForward: () => {
        const { view, selectedDate } = get();
        const nextDate = movedDate(selectedDate, view, 1);
        set({ selectedDate: nextDate, currentDate: anchorIso(nextDate) });
      },

      navigateBack: () => {
        const { view, selectedDate } = get();
        const nextDate = movedDate(selectedDate, view, -1);
        set({ selectedDate: nextDate, currentDate: anchorIso(nextDate) });
      },

      goToToday: () => {
        const date = formatDateKey(new Date());
        set({ selectedDate: date, currentDate: anchorIso(date) });
      },

      setSelectedDate: (date) => {
        if (!parseLocalDateKey(date)) return;
        set({ selectedDate: date, currentDate: anchorIso(date) });
      },

      fetchTimeBlocks: async (start, end) => {
        const requestSequence = ++timeBlockFetchSequence;
        set({ loading: true, error: null });
        try {
          const res = await fetch(
            `/api/time-blocks?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
          );
          if (!res.ok) throw new Error("fetch failed");
          const data = await res.json();
          if (requestSequence !== timeBlockFetchSequence) return;
          set({ timeBlocks: data, loading: false, error: null });
        } catch (error) {
          if (requestSequence !== timeBlockFetchSequence) return;
          set({
            loading: false,
            error: error instanceof Error ? error.message : "fetch failed",
          });
        }
      },

      fetchReviewDates: async (start, end) => {
        const requestSequence = ++reviewDateFetchSequence;
        set({ reviewDatesLoading: true, reviewDatesError: null });
        try {
          const res = await fetch(
            `/api/quiz/review-dates?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
          );
          if (!res.ok) throw new Error("fetch failed");
          const data = await res.json();
          if (requestSequence !== reviewDateFetchSequence) return;
          set({
            reviewDates: new Set(data.dates),
            reviewDatesLoading: false,
            reviewDatesError: null,
          });
        } catch (error) {
          if (requestSequence !== reviewDateFetchSequence) return;
          set({
            reviewDatesLoading: false,
            reviewDatesError:
              error instanceof Error ? error.message : "fetch failed",
          });
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
          set((state) => ({ timeBlocks: [...state.timeBlocks, created] }));
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
          if (!res.ok) return null;
          const updated = await res.json();
          set((state) => ({
            timeBlocks: state.timeBlocks.map((block) =>
              block.id === id ? updated : block,
            ),
          }));
          return updated;
        } catch {
          return null;
        }
      },

      toggleTimeBlockCompleted: async (id) => {
        const block = get().timeBlocks.find((item) => item.id === id);
        if (!block) return false;
        const completed = !block.completed;
        set((state) => ({
          timeBlocks: state.timeBlocks.map((item) =>
            item.id === id ? { ...item, completed } : item,
          ),
        }));

        try {
          const res = await fetch(`/api/time-blocks/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ completed }),
          });
          if (res.ok) return true;
        } catch {
          // revert below
        }

        set((state) => ({
          timeBlocks: state.timeBlocks.map((item) =>
            item.id === id ? { ...item, completed: !completed } : item,
          ),
        }));
        return false;
      },

      deleteTimeBlock: async (id) => {
        try {
          const res = await fetch(`/api/time-blocks/${id}`, {
            method: "DELETE",
          });
          if (!res.ok) return false;
          set((state) => ({
            timeBlocks: state.timeBlocks.filter((block) => block.id !== id),
          }));
          return true;
        } catch {
          return false;
        }
      },
    }),
    {
      name: "oghma-calendar",
      partialize: (state) => ({ view: state.view }),
    },
  ),
);

export default useCalendarStore;
