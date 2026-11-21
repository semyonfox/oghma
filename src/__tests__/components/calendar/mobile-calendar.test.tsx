// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MobileCalendar from "@/components/calendar/mobile-calendar";

vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  default: () => ({
    activeLocale: "en",
    t: (key: string) => key,
  }),
}));

vi.mock("@/lib/notes/state/calendar", () => {
  const state = {
    view: "month" as const,
    currentDate: "2026-08-15T12:00:00.000Z",
    selectedDate: "2026-08-15",
    setSelectedDate: vi.fn(),
    timeBlocks: [],
    reviewDates: new Set<string>(),
    loading: false,
    error: null,
  };
  return {
    default: (selector?: (value: typeof state) => unknown) =>
      selector ? selector(state) : state,
  };
});

vi.mock("@/lib/notes/state/assignments", () => {
  const state = { assignments: [] };
  return {
    default: (selector: (value: typeof state) => unknown) => selector(state),
  };
});

vi.mock("@/components/calendar/day-agenda", () => ({
  default: () => <div>Day agenda</div>,
}));

describe("MobileCalendar", () => {
  it("keeps the month collapsed until asked and wires the Month and Tasks buttons", () => {
    const onToggleMonth = vi.fn();
    const onOpenTasks = vi.fn();
    render(
      <MobileCalendar
        onAddTask={vi.fn()}
        onRetry={vi.fn()}
        onOpenTasks={onOpenTasks}
        monthOpen={false}
        onToggleMonth={onToggleMonth}
      />,
    );

    expect(screen.getByText("Day agenda")).toBeTruthy();
    expect(document.getElementById("mobile-calendar-month")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Month" }));
    expect(onToggleMonth).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Tasks" }));
    expect(onOpenTasks).toHaveBeenCalledOnce();
  });

  it("marks the selected day in the expanded month", () => {
    render(
      <MobileCalendar
        onAddTask={vi.fn()}
        onRetry={vi.fn()}
        monthOpen
      />,
    );

    const month = document.getElementById("mobile-calendar-month");
    if (!month) throw new Error("Expected an expanded month");
    const selectedDate = within(month).getByRole("button", {
      name: "Saturday, August 15, 2026",
    });
    expect(selectedDate.getAttribute("aria-pressed")).toBe("true");
    // bg-surface on the selected day would override its highlight
    expect(selectedDate.classList.contains("bg-surface")).toBe(false);
  });
});
