// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import AssignmentTracker from "@/components/assignments/assignment-tracker";
import type { Assignment, AssignmentTab } from "@/lib/notes/state/assignments.zustand";

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
let displayedAssignments = [assignment];
let selectedTab: AssignmentTab = "late";
const updateAssignment = vi.fn();

vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  default: () => ({ t: (key: string) => key, activeLocale: "en" }),
}));
vi.mock("@/lib/notes/state/assignments.zustand", () => ({
  default: () => ({
    assignments: displayedAssignments,
    loading: false,
    hasLoaded: true,
    error: null,
    courseFilter: null,
    activeTab: selectedTab,
    includeAll: true,
    includeArchived: false,
    fetchAssignments: vi.fn().mockResolvedValue(undefined),
    updateAssignment,
  }),
}));
vi.mock("@/lib/notes/state/pomodoro.zustand", () => ({ default: () => vi.fn() }));
vi.mock("@/lib/notes/state/courses.zustand", () => ({
  default: () => ({ settings: {}, fetchSettings: vi.fn().mockResolvedValue(undefined) }),
}));
vi.mock("@/components/assignments/new-task-modal", () => ({
  default: ({ open, assignment }: { open: boolean; assignment?: Assignment | null }) =>
    open ? <div role="dialog" aria-label={assignment ? "Edit task" : "New Task"} /> : null,
}));
vi.mock("@/components/course-visibility/course-visibility-manager", () => ({
  CourseVisibilityDialog: () => null,
  mergeCourseVisibilityItems: () => [],
}));

beforeEach(() => {
  displayedAssignments = [assignment];
  selectedTab = "late";
  updateAssignment.mockReset();
  updateAssignment.mockResolvedValue(assignment);
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

  it("keeps New Task above a long scrollable list in the mobile task pane", () => {
    displayedAssignments = Array.from({ length: 12 }, (_, index) => ({
      ...assignment,
      id: `task-${index}`,
      title: `Task ${index}`,
    }));
    render(<AssignmentTracker surface="full" />);

    const create = screen.getByRole("button", { name: "New Task" });
    const list = screen.getByRole("tabpanel");
    expect(create.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole("article")).toHaveLength(12);
    fireEvent.click(create);
    expect(screen.getByRole("dialog", { name: "New Task" })).toBeTruthy();
  });

  it("opens editing only for manual tasks", () => {
    render(<AssignmentTracker surface="compact" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit task: Database report" }));
    expect(screen.getByRole("dialog", { name: "Edit task" })).toBeTruthy();

    cleanup();
    displayedAssignments = [{ ...assignment, id: "canvas-task", source: "canvas" }];
    render(<AssignmentTracker surface="compact" />);
    expect(screen.queryByRole("button", { name: /Edit task/ })).toBeNull();
  });

  it("shows completed state and lets a task be undone", async () => {
    displayedAssignments = [{ ...assignment, status: "done" }];
    selectedTab = "done";
    render(<AssignmentTracker surface="compact" />);

    const card = screen.getByRole("article");
    expect(within(card).getByText("Done")).toBeTruthy();
    const undo = within(card).getByRole("button", { name: "Undo" });
    expect(undo.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(undo);
    await waitFor(() =>
      expect(updateAssignment).toHaveBeenCalledWith("historic-task", {
        status: "upcoming",
      }),
    );
  });
});
