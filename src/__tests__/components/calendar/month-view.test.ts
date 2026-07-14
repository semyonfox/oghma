// @vitest-environment jsdom

import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MonthView from "@/components/calendar/month-view";

vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  default: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values?.date ? key.replace("{date}", values.date) : key,
  }),
}));

vi.mock("@/lib/notes/state/calendar.zustand", () => ({
  default: () => ({
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
    fetchReviewDates: vi.fn(),
  }),
}));

vi.mock("@/lib/notes/state/assignments.zustand", () => ({
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
  it("does not nest event action buttons inside day-selection buttons", () => {
    const { container } = render(React.createElement(MonthView));

    expect(container.querySelector("button button")).toBeNull();
    expect(container.querySelector('button[aria-label="Mark complete"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label^="Select "]')).not.toBeNull();
  });
});
