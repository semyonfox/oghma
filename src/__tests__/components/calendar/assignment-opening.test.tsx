// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Assignment } from "@/lib/notes/state/assignments.zustand";
import AssignmentTracker from "@/components/assignments/assignment-tracker";
import MonthView from "@/components/calendar/month-view";
import WeekView from "@/components/calendar/week-view";
import DayAgendaDialog from "@/components/calendar/day-agenda-dialog";
const mocks = vi.hoisted(() => ({ update: vi.fn(), selectDate: vi.fn(), fetch: vi.fn().mockResolvedValue(undefined), settings: {} }));
const assignment: Assignment = {
  id: "task-1", title: "Database project", description: "Design a relational schema.",
  source: "manual", assignment_type: "manual", canvas_course_id: null, canvas_assignment_id: null,
  course_name: "Databases", course_color: null, due_at: "2026-09-21T12:00:00", status: "done",
  estimated_hours: null, logged_hours: 0, submitted_at: null, score: null, points_possible: null,
  created_at: "2026-09-21", updated_at: "2026-09-21",
};
vi.mock("@/lib/notes/hooks/use-i18n", () => ({ default: () => ({ t: (key: string) => key, activeLocale: "en" }) }));
vi.mock("@/lib/notes/state/assignments.zustand", () => ({ default: () => ({ assignments: [assignment], updateAssignment: mocks.update, hasLoaded: true, activeTab: "done", includeAll: true, includeArchived: false, courseFilter: null, fetchAssignments: mocks.fetch }) }));
vi.mock("@/lib/notes/state/calendar.zustand", () => ({ default: () => ({
  currentDate: "2026-09-21T12:00:00", selectedDate: "2026-09-21", timeBlocks: [], reviewDates: new Set(),
  setSelectedDate: mocks.selectDate, deleteTimeBlock: vi.fn(), toggleTimeBlockCompleted: vi.fn(),
}) }));
vi.mock("@/lib/notes/state/pomodoro.zustand", () => ({ default: () => vi.fn() }));
vi.mock("@/lib/notes/state/courses.zustand", () => ({ default: () => ({ settings: mocks.settings, fetchSettings: mocks.fetch }) }));
vi.mock("@/components/assignments/new-task-modal", () => ({ default: () => null }));
vi.mock("@/components/course-visibility/course-visibility-manager", () => ({ CourseVisibilityDialog: () => null, mergeCourseVisibilityItems: () => [] }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("calendar assignment opening", () => {
  it.each(["month", "week", "day", "compact tasks", "full tasks"])("opens and closes real details from the %s view without completing the task", async view => {
    if (view === "compact tasks") render(<AssignmentTracker surface="compact" />);
    if (view === "full tasks") render(<AssignmentTracker surface="full" />);
    if (view === "month") render(<MonthView />);
    if (view === "week") render(<WeekView />);
    if (view === "day") render(<DayAgendaDialog open dateKey="2026-09-21" onClose={vi.fn()} onAddTask={vi.fn()} onRetry={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Database project" }));
    expect(await screen.findByRole("dialog", { name: "Database project" })).toBeTruthy();
    expect(screen.getByText("Design a relational schema.")).toBeTruthy();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.selectDate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "Database project" })).toBeNull();
  });
});
