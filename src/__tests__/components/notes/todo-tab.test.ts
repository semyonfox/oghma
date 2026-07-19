// @vitest-environment jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/assignments/assignment-tracker", () => ({
  default: () => React.createElement("div", { "data-testid": "assignment-tracker" }),
}));

import TodoTab from "@/components/notes/todo-tab";

describe("TodoTab", () => {
  it("uses the real assignment tracker inside the inspector sizing boundary", () => {
    const { container } = render(React.createElement(TodoTab));

    expect(screen.getByTestId("assignment-tracker")).toBeTruthy();
    const classNames = container.firstElementChild?.className.split(" ") ?? [];
    expect(classNames).toEqual(
      expect.arrayContaining(["flex-1", "flex-col", "min-h-0", "overflow-hidden"]),
    );
  });
});
