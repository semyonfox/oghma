// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MonthView from "@/components/calendar/month-view";
import { buildMonthCells, nextFreeStudyHour } from "@/components/calendar/month-view-utils";

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
    if (!cell) throw new Error("Expected the July 15 drop target");
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

describe("buildMonthCells", () => {
  it("builds a Monday-start, six-week grid across month boundaries", () => {
    const cells = buildMonthCells({
      anchorDate: new Date(2026, 1, 10),
      assignments: [],
      timeBlocks: [],
      selectedDate: null,
      today: new Date(2026, 1, 1),
    });

    expect(cells).toHaveLength(42);
    expect(cells[0]).toMatchObject({
      date: "2026-01-26",
      isCurrentMonth: false,
    });
    expect(cells[6]).toMatchObject({
      date: "2026-02-01",
      isCurrentMonth: true,
      isToday: true,
    });
    expect(cells[41]).toMatchObject({
      date: "2026-03-08",
      isCurrentMonth: false,
    });
  });

  it("projects dated items by date key and marks the selected cell", () => {
    const cells = buildMonthCells({
      anchorDate: new Date(2026, 1, 10),
      assignments: [
        {
          id: "assignment-1",
          title: "Submit report",
          course_color: "#123456",
          due_at: "2026-02-28T12:00:00.000Z",
          status: "upcoming",
        },
        {
          id: "outside-grid",
          title: "Ignored",
          course_color: null,
          due_at: "2026-04-01T12:00:00.000Z",
          status: "upcoming",
        },
      ],
      timeBlocks: [
        {
          id: "block-1",
          title: "Fallback title",
          assignment_title: "Review notes",
          course_color: "#654321",
          starts_at: "2026-02-28T12:00:00.000Z",
          completed: false,
        },
      ],
      selectedDate: "2026-02-28",
      today: new Date(2026, 1, 1),
    });

    expect(cells.find((cell) => cell.date === "2026-02-28")).toMatchObject({
      isSelected: true,
      assignments: [
        {
          id: "assignment-1",
          title: "Submit report",
          courseColor: "#123456",
          status: "upcoming",
        },
      ],
      timeBlocks: [
        {
          id: "block-1",
          title: "Review notes",
          courseColor: "#654321",
          completed: false,
        },
      ],
    });
    expect(cells.some((cell) => cell.assignments[0]?.id === "outside-grid")).toBe(false);
  });
});

describe("nextFreeStudyHour", () => {
  const block = (start: Date, end: Date) => ({ starts_at: start.toISOString(), ends_at: end.toISOString() });

  it("defaults to 09:00 and skips partial overlaps, allowing adjacent blocks", () => {
    expect(nextFreeStudyHour("2026-10-06", [])).toEqual(new Date(2026, 9, 6, 9));
    const blocks = [
      block(new Date(2026, 9, 6, 8, 30), new Date(2026, 9, 6, 9, 30)),
      block(new Date(2026, 9, 6, 10, 30), new Date(2026, 9, 6, 11)),
    ];
    expect(nextFreeStudyHour("2026-10-06", blocks)).toEqual(new Date(2026, 9, 6, 11));
  });

  it("accounts for overnight blocks and falls back to 09:00 on a full day", () => {
    expect(nextFreeStudyHour("2026-10-06", [
      block(new Date(2026, 9, 5, 23), new Date(2026, 9, 6, 10)),
    ])).toEqual(new Date(2026, 9, 6, 10));
    expect(nextFreeStudyHour("2026-10-06", [
      block(new Date(2026, 9, 6), new Date(2026, 9, 7)),
    ])).toEqual(new Date(2026, 9, 6, 9));
  });
});
