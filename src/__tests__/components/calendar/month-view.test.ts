// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MonthView from "@/components/calendar/month-view";

const createTimeBlock = vi.fn().mockResolvedValue({ id: "created" });

vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  default: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values?.date ? key.replace("{date}", values.date) : key,
  }),
}));

vi.mock("@/lib/notes/state/calendar", () => ({
  default: () => ({
    createTimeBlock,
    currentDate: "2026-07-15T12:00:00.000Z",
    selectedDate: null,
    setSelectedDate: vi.fn(),
    deleteTimeBlock: vi.fn(),
    toggleTimeBlockCompleted: vi.fn(),
    timeBlocks: [
      {
        id: "block-1",
        starts_at: "2026-07-15T12:00:00.000Z",
        assignment_title: "Review notes",
        title: null,
        course_color: null,
        completed: false,
      },
    ],
    fetchTimeBlocks: vi.fn(),
    reviewDates: new Set<string>(),
    examLoad: {},
    fetchReviewDates: vi.fn(),
  }),
}));

vi.mock("@/lib/notes/state/assignments", () => ({
  default: () => ({
    assignments: [
      {
        id: "assignment-1",
        title: "Submit report",
        due_at: "2026-07-15T12:00:00.000Z",
        course_color: null,
        status: "upcoming",
      },
    ],
    updateAssignment: vi.fn(),
  }),
}));

describe("MonthView", () => {
  it("creates an assignment-linked hour on drop and ignores unrelated drags", async () => {
    const { container } = render(React.createElement(MonthView));
    const cell = container.querySelector('time[datetime="2026-07-15"]')?.closest("button")?.parentElement;
    expect(cell).toBeTruthy();
    if (!cell) return;
    fireEvent.drop(cell, { dataTransfer: { getData: () => "unrelated" } });
    expect(createTimeBlock).not.toHaveBeenCalled();
    fireEvent.drop(cell, { dataTransfer: { getData: () => "assignment-1" } });
    await waitFor(() => expect(createTimeBlock).toHaveBeenCalledWith({
      assignment_id: "assignment-1",
      title: "Submit report",
      starts_at: new Date(2026, 6, 15, 9).toISOString(),
      ends_at: new Date(2026, 6, 15, 10).toISOString(),
    }));
  });

  it("does not nest event action buttons inside day-selection buttons", () => {
    const { container } = render(React.createElement(MonthView));

    expect(container.querySelector("button button")).toBeNull();
    expect(container.querySelector('button[aria-label="Mark as done"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label^="Select "]')).not.toBeNull();
  });
});
