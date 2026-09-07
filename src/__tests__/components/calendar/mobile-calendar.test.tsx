// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MobileCalendar from "@/components/calendar/mobile-calendar";

const mocks = vi.hoisted(() => ({ setView: vi.fn() }));

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
    setView: mocks.setView,
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
  it("shows a full month grid and lets people switch to the week view", () => {
    render(
      <MobileCalendar onAddTask={vi.fn()} onRetry={vi.fn()} />,
    );

    const monthPanel = screen.getByRole("tabpanel", { name: "Month view" });
    expect(within(monthPanel).getAllByRole("button")).toHaveLength(42);

    fireEvent.click(screen.getByRole("tab", { name: "Week" }));
    expect(mocks.setView).toHaveBeenCalledWith("week");
  });
});
