// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TogglePill } from "@/components/chat/chat-interface";

describe("TogglePill", () => {
  it("does not keep its tooltip open from mouse-click focus", () => {
    const onClick = vi.fn();
    render(
      <TogglePill
        active
        onClick={onClick}
        icon={<span aria-hidden="true">◆</span>}
        label="Thinking on"
        tooltipTitle="Thinking mode"
        tooltipText="Use more reasoning"
      />,
    );

    const button = screen.getByRole("button", { name: "Thinking on" });
    const tooltip = screen.getByRole("tooltip");

    fireEvent.click(button);

    expect(onClick).toHaveBeenCalledOnce();
    expect(button.classList.contains("peer")).toBe(true);
    expect(tooltip.classList.contains("group-hover:opacity-100")).toBe(true);
    expect(tooltip.classList.contains("peer-focus-visible:opacity-100")).toBe(true);
    expect(tooltip.classList.contains("group-focus-within:opacity-100")).toBe(false);
  });
});
