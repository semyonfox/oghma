// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import AssignmentTracker from "@/components/assignments/assignment-tracker";
import type { Assignment } from "@/lib/notes/state/assignments.zustand";

const assignment: Assignment = {
  id: "historic-task",
  title: "Database report",
  description: null,
  source: "manual",
  assignment_type: "manual",
  canvas_course_id: null,
  canvas_assignment_id: null,
  course_name: "Databases",
  course_color: null,
  due_at: "1333-01-01T12:00:00.000Z",
  status: "late",
  estimated_hours: 3,
  logged_hours: 0,
  submitted_at: null,
  score: null,
  points_possible: null,
  created_at: "2026-09-24T12:00:00.000Z",
  updated_at: "2026-09-24T12:00:00.000Z",
};

vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  default: () => ({ t: (key: string) => key, activeLocale: "en" }),
}));
vi.mock("@/lib/notes/state/assignments.zustand", () => ({
  default: () => ({
    assignments: [assignment],
    loading: false,
    hasLoaded: true,
    error: null,
    courseFilter: null,
    activeTab: "late",
    includeAll: true,
    includeArchived: false,
    fetchAssignments: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock("@/lib/notes/state/pomodoro.zustand", () => ({ default: () => vi.fn() }));
vi.mock("@/lib/notes/state/courses.zustand", () => ({
  default: () => ({ settings: {}, fetchSettings: vi.fn().mockResolvedValue(undefined) }),
}));
vi.mock("@/components/assignments/new-task-modal", () => ({ default: () => null }));
vi.mock("@/components/course-visibility/course-visibility-manager", () => ({
  CourseVisibilityDialog: () => null,
  mergeCourseVisibilityItems: () => [],
}));

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("assignment tracker", () => {
  it("keeps very old due dates and hour estimates readable", () => {
    render(<AssignmentTracker surface="compact" />);

    const card = screen.getByRole("article");
    expect(within(card).getByRole("button", { name: "Database report" })).toBeTruthy();
    expect(within(card).getByText("Overdue")).toBeTruthy();
    expect(within(card).getByText("0 / 3h")).toBeTruthy();
    expect(screen.queryByText(/\d{5,}d overdue/)).toBeNull();
  });
});
