// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MobileCalendar from "@/components/calendar/mobile-calendar";

const mocks = vi.hoisted(() => ({
  onOpenTasks: vi.fn(),
  onToggleMonth: vi.fn(),
}));

vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  default: () => ({
    activeLocale: "en",
    t: (key: string) => key,
  }),
}));

vi.mock("@/lib/notes/state/calendar.zustand", () => {
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

vi.mock("@/lib/notes/state/assignments.zustand", () => {
  const state = { assignments: [] };
  return {
    default: (selector: (value: typeof state) => unknown) => selector(state),
  };
});

vi.mock("@/components/calendar/day-agenda", () => ({
  default: () => <div>Day agenda</div>,
}));

describe("MobileCalendar", () => {
  it("keeps the agenda-first date strip visible and expands the month on request", () => {
    render(
      <MobileCalendar
        onAddTask={vi.fn()}
        onRetry={vi.fn()}
        onOpenTasks={mocks.onOpenTasks}
        monthOpen={false}
        onToggleMonth={mocks.onToggleMonth}
      />,
    );

    expect(screen.getByText("Day agenda")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "August 1, 2026" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Month" }));
    expect(mocks.onToggleMonth).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Tasks" }));
    expect(mocks.onOpenTasks).toHaveBeenCalledOnce();
  });

  it("renders the selectable month without overriding the selected-day background", () => {
    render(
      <MobileCalendar
        onAddTask={vi.fn()}
        onRetry={vi.fn()}
        monthOpen
        onToggleMonth={mocks.onToggleMonth}
      />,
    );

    const month = document.getElementById("mobile-calendar-month");
    expect(month).not.toBeNull();
    const selectedDate = within(month!).getByRole("button", {
      name: "Saturday, August 15, 2026",
    });
    expect(selectedDate.classList.contains("bg-primary-600")).toBe(true);
    expect(selectedDate.classList.contains("bg-surface")).toBe(false);
  });
});
