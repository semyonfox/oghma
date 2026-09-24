// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import NewTaskModal from "@/components/assignments/new-task-modal";
import type { Assignment } from "@/lib/notes/state/assignments.zustand";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  success: vi.fn(),
}));

const task: Assignment = {
  id: "manual-task",
  title: "Lab report",
  description: "Check the results",
  source: "manual",
  assignment_type: "manual",
  canvas_course_id: null,
  canvas_assignment_id: null,
  course_name: "Biology",
  course_color: null,
  due_at: "2026-10-02T15:45:37.000Z",
  status: "upcoming",
  estimated_hours: 2,
  logged_hours: 0,
  submitted_at: null,
  score: null,
  points_possible: null,
  created_at: "2026-09-24T12:00:00.000Z",
  updated_at: "2026-09-24T12:00:00.000Z",
};

vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  default: () => ({ t: (key: string) => key, activeLocale: "en-IE" }),
}));
vi.mock("@/lib/notes/state/assignments.zustand", () => ({
  default: (selector: (state: { createAssignment: typeof mocks.create; updateAssignment: typeof mocks.update }) => unknown) =>
    selector({ createAssignment: mocks.create, updateAssignment: mocks.update }),
}));
vi.mock("sonner", () => ({ toast: { success: mocks.success } }));
vi.mock("@/components/navigation/use-swipe-dismiss", () => ({ default: () => ({}) }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("task form", () => {
  it("creates an upcoming task and confirms the saved due date without completing it", async () => {
    const requestedDueAt = new Date("2026-10-02T09:30").toISOString();
    const savedDueAt = new Date("2026-10-02T10:30").toISOString();
    mocks.create.mockResolvedValue({
      ...task,
      id: "new-task",
      title: "Essay",
      due_at: savedDueAt,
    });
    const onClose = vi.fn();
    render(<NewTaskModal open onClose={onClose} courses={[]} />);

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Essay" } });
    fireEvent.change(screen.getByLabelText("Due Date"), {
      target: { value: "2026-10-02T09:30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Task" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Essay", due_at: requestedDueAt }),
    ));
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.success).toHaveBeenCalledWith(
      `Task created · Upcoming · Due Date: ${new Intl.DateTimeFormat("en-IE", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(savedDueAt))}`,
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("prefills local time and edits a manual task through PATCH state", async () => {
    if (!task.due_at) throw new Error("task fixture needs a due date");
    mocks.update.mockResolvedValue({ ...task, title: "Updated lab report" });
    const onClose = vi.fn();
    render(<NewTaskModal open onClose={onClose} courses={["Biology"]} assignment={task} />);

    const dueInput = screen.getByLabelText("Due Date") as HTMLInputElement;
    expect(new Date(dueInput.value).getTime()).toBe(
      new Date(task.due_at).getTime() - 37_000,
    );
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Updated lab report" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(
      task.id,
      expect.objectContaining({ title: "Updated lab report", due_at: task.due_at }),
    ));
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.success).toHaveBeenCalledWith(
      expect.stringMatching(/^Task updated · Upcoming · Due Date: /),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });
});
