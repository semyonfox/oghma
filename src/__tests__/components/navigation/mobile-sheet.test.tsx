// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  __esModule: true,
  default: () => ({ t: (key: string) => key }),
}));

import MobileSheet from "@/components/navigation/mobile-sheet";

describe("MobileSheet", () => {
  it("exposes a labelled dialog and a reachable close control", () => {
    const close = vi.fn();
    render(
      <MobileSheet open onClose={close} title="More">
        <button type="button">Settings</button>
      </MobileSheet>,
    );

    expect(
      screen.getByRole("dialog").getAttribute("aria-labelledby"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(close).toHaveBeenCalledTimes(1);
  });
});
