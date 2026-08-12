// @vitest-environment jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/assignments/assignment-tracker", () => ({
  default: ({ surface }: { surface: string }) =>
    React.createElement("div", {
      "data-surface": surface,
      "data-testid": "assignment-tracker",
    }),
}));

import TodoTab from "@/components/notes/todo-tab";

describe("TodoTab", () => {
  it("forwards the inspector surface to the shared tracker", () => {
    const { rerender } = render(React.createElement(TodoTab));

    expect(screen.getByTestId("assignment-tracker").getAttribute("data-surface")).toBe(
      "compact",
    );
    rerender(React.createElement(TodoTab, { surface: "full" }));

    expect(screen.getByTestId("assignment-tracker").getAttribute("data-surface")).toBe(
      "full",
    );
  });
});
