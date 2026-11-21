// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import DayStrip from "@/components/calendar/day-strip";

const weekday = new Intl.DateTimeFormat("en", { weekday: "narrow" });
const full = new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric" });

function ControlledStrip() {
  const [selectedDate, setSelectedDate] = useState("2026-11-09");
  return (
    <DayStrip
      selectedDate={selectedDate}
      today="2026-11-09"
      onSelect={setSelectedDate}
      weekdayFormatter={weekday}
      fullDateFormatter={full}
      label="Select date"
    />
  );
}

function renderStrip() {
  render(<ControlledStrip />);
  return screen.getByRole("group", { name: "Select date" });
}

function selectedDay() {
  return screen.getByRole("button", { pressed: true }).getAttribute("aria-label");
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
    const strip = renderStrip();
    const today = screen.getByRole("button", { name: "November 9, 2026" });

    fireEvent.pointerDown(today, pointer(200));
    fireEvent.pointerMove(strip, pointer(95));
    expect(selectedDay()).toBe("November 11, 2026");
    fireEvent.pointerUp(strip, pointer(95));
    fireEvent.click(today);
    expect(selectedDay()).toBe("November 11, 2026");
  });

  it("leaves vertical moves to the page and still selects a tapped day", () => {
    const strip = renderStrip();
    fireEvent.pointerDown(strip, pointer(200, 20));
    fireEvent.pointerMove(strip, pointer(205, 80));
    expect(selectedDay()).toBe("November 9, 2026");

    fireEvent.click(screen.getByRole("button", { name: "November 10, 2026" }));
    expect(selectedDay()).toBe("November 10, 2026");
  });

  it("moves with the arrow keys", () => {
    renderStrip();
    fireEvent.keyDown(screen.getByRole("button", { name: "November 9, 2026" }), { key: "ArrowLeft" });
    expect(selectedDay()).toBe("November 8, 2026");
  });
});
