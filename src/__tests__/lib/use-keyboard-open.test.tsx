// @vitest-environment jsdom

import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import useKeyboardOpen from "@/lib/hooks/use-keyboard-open";

function Probe() {
  const open = useKeyboardOpen();
  return <>
    <input aria-label="Title" />
    <button>Plain</button>
    <output>{open ? "keyboard" : "none"}</output>
  </>;
}

function setHeight(height: number) {
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
  act(() => { window.dispatchEvent(new Event("resize")); });
}

beforeEach(() => {
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 915 });
});

describe("useKeyboardOpen", () => {
  it("reports a keyboard only when a focused field loses a keyboard's worth of height", () => {
    render(<Probe />);
    const state = () => screen.getByRole("status").textContent;
    // jsdom has no isContentEditable, so the editor's contenteditable path is
    // left to the browser and an input stands in here
    act(() => screen.getByLabelText("Title").focus());
    expect(state()).toBe("none");
    // a browser toolbar collapsing is not a keyboard
    setHeight(860);
    expect(state()).toBe("none");
    setHeight(520);
    expect(state()).toBe("keyboard");
    act(() => screen.getByLabelText("Title").blur());
    expect(state()).toBe("none");
  });

  it("ignores a resize while nothing editable has focus", () => {
    render(<Probe />);
    act(() => screen.getByRole("button").focus());
    setHeight(520);
    expect(screen.getByRole("status").textContent).toBe("none");
    act(() => screen.getByLabelText("Title").focus());
    setHeight(400);
    // the resting height followed the earlier resize, so 120px is not enough
    expect(screen.getByRole("status").textContent).toBe("none");
  });
});
