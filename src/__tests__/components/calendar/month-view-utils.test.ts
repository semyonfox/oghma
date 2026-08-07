import { describe, expect, it } from "vitest";
import { buildMonthCells } from "@/components/calendar/month-view-utils";

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
