// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import CanvasCourseSelector from "@/components/settings/canvas/canvas-course-selector";

const courses = [
  {
    id: "current-restricted",
    name: "Current Algorithms",
    course_code: "CT216",
    canvasStatus: "current",
  },
  {
    id: "past-synced",
    name: "Past Databases",
    course_code: "CT210",
    canvasStatus: "past",
  },
  {
    id: "unavailable",
    name: "Unavailable Networks",
    course_code: "CT220",
    canvasStatus: "inaccessible",
    canvasStatusReason: "access_revoked",
  },
];

function renderSelector(overrides = {}) {
  const props = {
    courses,
    selectedCourseIds: [],
    onToggleCourse: vi.fn(),
    onToggleSelectAll: vi.fn(),
    getCourseStatus: (id: string) =>
      id === "current-restricted"
        ? { status: "forbidden", error: null }
        : { status: "synced", error: null },
    courseListOpen: true,
    setCourseListOpen: vi.fn(),
    t: (key: string) => key,
    ...overrides,
  };

  render(React.createElement(CanvasCourseSelector, props));
  return props;
}

describe("CanvasCourseSelector", () => {
  it("shows Canvas availability separately from local import status", () => {
    renderSelector();

    const currentRow = screen.getByText("Current Algorithms").closest("label");
    expect(currentRow?.textContent).toContain("Current");
    expect(currentRow?.textContent).toContain("Restricted");

    const pastRow = screen.getByText("Past Databases").closest("label");
    expect(pastRow?.textContent).toContain("Past");
    expect(pastRow?.textContent).toContain("Synced");
  });

  it("disables inaccessible courses and never delegates their selection", () => {
    const { onToggleCourse } = renderSelector();
    const unavailable = screen.getByRole("checkbox", {
      name: /Unavailable Networks/i,
    });

    expect((unavailable as HTMLInputElement).disabled).toBe(true);
    const descriptionId = unavailable.getAttribute("aria-describedby");
    expect(document.getElementById(descriptionId ?? "")?.textContent).toBe(
      "This course is no longer available in Canvas.",
    );
    fireEvent.click(unavailable);
    expect(onToggleCourse).not.toHaveBeenCalled();
  });

  it("distinguishes a temporary Canvas lookup failure from revoked access", () => {
    renderSelector({
      courses: [
        {
          id: "lookup-failed",
          name: "Checking History",
          course_code: "CT230",
          canvasStatus: "unavailable",
          canvasStatusReason: "lookup_failed",
        },
      ],
    });

    const checkbox = screen.getByRole("checkbox", {
      name: /Checking History/i,
    });
    expect((checkbox as HTMLInputElement).disabled).toBe(true);
    expect(
      document.getElementById(checkbox.getAttribute("aria-describedby") ?? "")
        ?.textContent,
    ).toBe("Canvas could not confirm access to this course. Try again later.");
  });

  it("keeps locally restricted current courses selectable and excludes unavailable courses from select all", () => {
    const { onToggleCourse, onToggleSelectAll } = renderSelector();

    fireEvent.click(
      screen.getByRole("checkbox", { name: /Current Algorithms/i }),
    );
    expect(onToggleCourse).toHaveBeenCalledWith("current-restricted");

    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(onToggleSelectAll).toHaveBeenCalledTimes(1);
  });
});
