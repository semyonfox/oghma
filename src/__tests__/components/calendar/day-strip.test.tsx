// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DayStrip from "@/components/calendar/day-strip";

const weekday = new Intl.DateTimeFormat("en", { weekday: "narrow" });
const full = new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric" });

function renderStrip(onSelect = vi.fn()) {
  render(
    <DayStrip
      selectedDate="2026-11-09"
      today="2026-11-09"
      onSelect={onSelect}
      weekdayFormatter={weekday}
      fullDateFormatter={full}
      label="Select date"
    />,
  );
  return { onSelect, strip: screen.getByRole("group", { name: "Select date" }) };
}

const pointer = (clientX: number, clientY = 20) => ({
  pointerId: 1,
  isPrimary: true,
  button: 0,
  clientX,
  clientY,
});

beforeEach(() => {
  // seven columns of 50px
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    { width: 350, height: 56, top: 0, left: 0, right: 350, bottom: 56, x: 0, y: 0, toJSON: () => ({}) },
  );
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DayStrip", () => {
  it("steps one day per column dragged and swallows the click that ends the drag", () => {
    const { onSelect, strip } = renderStrip();
    const today = screen.getByRole("button", { name: "November 9, 2026" });

    fireEvent.pointerDown(today, pointer(200));
    fireEvent.pointerMove(strip, pointer(95));
    expect(onSelect).toHaveBeenLastCalledWith("2026-11-11");
    fireEvent.pointerUp(strip, pointer(95));
    fireEvent.click(today);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("leaves vertical moves to the page and still selects a tapped day", () => {
    const { onSelect, strip } = renderStrip();
    fireEvent.pointerDown(strip, pointer(200, 20));
    fireEvent.pointerMove(strip, pointer(205, 80));
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "November 10, 2026" }));
    expect(onSelect).toHaveBeenCalledWith("2026-11-10");
  });

  it("moves with the arrow keys", () => {
    const { onSelect } = renderStrip();
    fireEvent.keyDown(screen.getByRole("button", { name: "November 9, 2026" }), { key: "ArrowLeft" });
    expect(onSelect).toHaveBeenCalledWith("2026-11-08");
  });
});
