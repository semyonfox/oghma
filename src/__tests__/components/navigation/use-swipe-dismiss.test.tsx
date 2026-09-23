// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import useSwipeDismiss from "@/components/navigation/use-swipe-dismiss";

function Panel({ onClose, direction = "down", open = true, breakpoint }: {
  onClose: () => void; direction?: "down" | "left" | "right"; open?: boolean; breakpoint?: number;
}) {
  const swipe = useSwipeDismiss({ open, onClose, direction, breakpoint });
  return <section {...swipe} data-testid="panel">
    <h2>Panel title</h2>
    <div data-testid="scroll" style={{ overflowX: "auto", overflowY: "auto" }}><p>Scrollable text</p></div>
    <input aria-label="Draft" /><button>Action</button>
    <div data-swipe-ignore>Map canvas</div><div role="slider" aria-valuenow={0}>Volume</div>
  </section>;
}

function touch(target: Element, type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel", x: number, y: number, count = 1) {
  return fireEvent[type](target, {
    touches: type === "touchEnd" ? [] : Array.from({ length: count }, (_, identifier) => ({ identifier, clientX: x, clientY: y })),
    changedTouches: [{ identifier: 0, clientX: x, clientY: y }],
    cancelable: true,
  });
}

function swipe(target: Element, dx: number, dy: number) {
  touch(target, "touchStart", 100, 100);
  const moved = touch(target, "touchMove", 100 + dx, 100 + dy);
  const ended = touch(target, "touchEnd", 100 + dx, 100 + dy);
  return { moved, ended };
}

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  window.getSelection()?.removeAllRanges();
});

describe("mobile panel gestures", () => {
  it.each([
    ["down", 0, 90, "translateY(90px)"],
    ["left", -90, 0, "translateX(-90px)"],
    ["right", 90, 0, "translateX(90px)"],
  ] as const)("tracks and dismisses toward %s", (direction, x, y, transform) => {
    const close = vi.fn();
    render(<Panel direction={direction} onClose={close} />);
    const title = screen.getByText("Panel title");
    touch(title, "touchStart", 150, 150);
    expect(touch(title, "touchMove", 150 + x, 150 + y)).toBe(false);
    expect(screen.getByTestId("panel").style.transform).toBe(transform);
    expect(close).not.toHaveBeenCalled();
    touch(title, "touchEnd", 150 + x, 150 + y);
    expect(close).toHaveBeenCalledOnce();
  });

  it("keeps an in-progress swipe when the parent updates its close callback", () => {
    const firstClose = vi.fn();
    const latestClose = vi.fn();
    const view = render(<Panel onClose={firstClose} />);
    const title = screen.getByText("Panel title");
    touch(title, "touchStart", 100, 100);
    touch(title, "touchMove", 100, 130);
    view.rerender(<Panel onClose={latestClose} />);
    touch(title, "touchMove", 100, 190);
    touch(title, "touchEnd", 100, 190);
    expect(firstClose).not.toHaveBeenCalled();
    expect(latestClose).toHaveBeenCalledOnce();
  });

  it("cancels short, reversed, multi-touch, and interrupted gestures", () => {
    const close = vi.fn();
    render(<Panel onClose={close} />);
    const title = screen.getByText("Panel title");
    for (const [distance, finish] of [[30, "touchEnd"], [90, "touchCancel"]] as const) {
      touch(title, "touchStart", 100, 100);
      touch(title, "touchMove", 100, 100 + distance);
      touch(title, finish, 100, 100 + distance);
    }
    touch(title, "touchStart", 100, 100);
    touch(title, "touchMove", 100, 190);
    touch(title, "touchMove", 100, 100);
    touch(title, "touchEnd", 100, 100);
    touch(title, "touchStart", 100, 100);
    expect(touch(title, "touchMove", 100, 200, 2)).toBe(true);
    touch(title, "touchEnd", 100, 200);
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByTestId("panel").style.transform).toBe("");
  });

  it("leaves controls and a scrolled sheet to the browser", () => {
    const close = vi.fn();
    render(<Panel onClose={close} />);
    screen.getByTestId("scroll").scrollTop = 50;
    for (const target of [screen.getByRole("textbox"), screen.getByRole("button"), screen.getByText("Scrollable text")]) {
      touch(target, "touchStart", 100, 100);
      expect(touch(target, "touchMove", 100, 200)).toBe(true);
      touch(target, "touchEnd", 100, 200);
    }
    expect(close).not.toHaveBeenCalled();
  });

  it("preserves vertical and nested horizontal scrolling in a drawer", () => {
    const close = vi.fn();
    render(<Panel direction="right" onClose={close} />);
    const scroll = screen.getByTestId("scroll");
    Object.defineProperties(scroll, { scrollWidth: { value: 500 }, clientWidth: { value: 200 } });
    const text = screen.getByText("Scrollable text");
    touch(text, "touchStart", 100, 100);
    expect(touch(text, "touchMove", 200, 100)).toBe(true);
    touch(text, "touchEnd", 200, 100);
    const title = screen.getByText("Panel title");
    touch(title, "touchStart", 100, 100);
    expect(touch(title, "touchMove", 110, 200)).toBe(true);
    touch(title, "touchEnd", 110, 200);
    expect(close).not.toHaveBeenCalled();
  });

  it("allows pulling sheet content only from the top and ignores desktop drags", () => {
    const close = vi.fn();
    render(<Panel onClose={close} />);
    const text = screen.getByText("Scrollable text");
    touch(text, "touchStart", 100, 100);
    touch(text, "touchMove", 100, 190);
    touch(text, "touchEnd", 100, 190);
    expect(close).toHaveBeenCalledOnce();
    Object.defineProperty(window, "innerWidth", { value: 1280 });
    touch(text, "touchStart", 100, 100);
    expect(touch(text, "touchMove", 100, 190)).toBe(true);
    touch(text, "touchEnd", 100, 190);
    expect(close).toHaveBeenCalledOnce();
  });

  it("stays inert while closed and drops a drag when the panel closes", () => {
    const close = vi.fn();
    const view = render(<Panel open={false} onClose={close} />);
    const title = screen.getByText("Panel title");
    expect(swipe(title, 0, 90).moved).toBe(true);
    expect(screen.getByTestId("panel").style.transform).toBe("");
    view.rerender(<Panel onClose={close} />);
    touch(title, "touchStart", 100, 100);
    touch(title, "touchMove", 100, 190);
    expect(screen.getByTestId("panel").style.transform).toBe("translateY(90px)");
    view.rerender(<Panel open={false} onClose={close} />);
    expect(screen.getByTestId("panel").style.transform).toBe("");
    touch(title, "touchEnd", 100, 190);
    expect(close).not.toHaveBeenCalled();
  });

  it("swallows the tap after a claimed swipe but not a plain tap", () => {
    const close = vi.fn();
    render(<Panel onClose={close} />);
    const title = screen.getByText("Panel title");
    touch(title, "touchStart", 100, 100);
    expect(touch(title, "touchEnd", 100, 100)).toBe(true);
    touch(title, "touchStart", 100, 100);
    touch(title, "touchMove", 100, 104);
    expect(touch(title, "touchEnd", 100, 104)).toBe(true);
    // a claimed drag that falls short still must not click what's underneath
    expect(swipe(title, 0, 30).ended).toBe(false);
    expect(close).not.toHaveBeenCalled();
    expect(swipe(title, 0, 90).ended).toBe(false);
    expect(close).toHaveBeenCalledOnce();
  });

  it("gives up when the browser has already taken the touch for scrolling", () => {
    const close = vi.fn();
    render(<Panel onClose={close} />);
    const title = screen.getByText("Panel title");
    const move = (y: number, cancelable: boolean) => fireEvent.touchMove(title, {
      touches: [{ identifier: 0, clientX: 100, clientY: y }], cancelable,
    });
    touch(title, "touchStart", 100, 100);
    expect(move(190, false)).toBe(true);
    touch(title, "touchEnd", 100, 190);
    touch(title, "touchStart", 100, 100);
    move(130, true);
    expect(screen.getByTestId("panel").style.transform).toBe("translateY(30px)");
    move(190, false);
    expect(screen.getByTestId("panel").style.transform).toBe("");
    touch(title, "touchEnd", 100, 190);
    expect(close).not.toHaveBeenCalled();
  });

  it("resets when a different finger takes over", () => {
    const close = vi.fn();
    render(<Panel onClose={close} />);
    const title = screen.getByText("Panel title");
    touch(title, "touchStart", 100, 100);
    touch(title, "touchMove", 100, 130);
    fireEvent.touchMove(title, { touches: [{ identifier: 1, clientX: 100, clientY: 190 }], cancelable: true });
    expect(screen.getByTestId("panel").style.transform).toBe("");
    touch(title, "touchEnd", 100, 190);
    expect(close).not.toHaveBeenCalled();
  });

  it("leaves selected text, sliders, and opted-out regions alone", () => {
    const close = vi.fn();
    render(<Panel onClose={close} />);
    for (const target of [screen.getByText("Map canvas"), screen.getByRole("slider")]) {
      expect(swipe(target, 0, 90).moved).toBe(true);
    }
    const title = screen.getByText("Panel title");
    const range = document.createRange();
    range.selectNodeContents(title);
    window.getSelection()?.addRange(range);
    expect(swipe(title, 0, 90).moved).toBe(true);
    window.getSelection()?.removeAllRanges();
    touch(title, "touchStart", 100, 100);
    touch(title, "touchMove", 100, 130);
    window.getSelection()?.addRange(range);
    expect(touch(title, "touchMove", 100, 190)).toBe(true);
    touch(title, "touchEnd", 100, 190);
    expect(close).not.toHaveBeenCalled();
  });

  it("uses the drawer breakpoint and protects horizontal scrollers in a left drawer", () => {
    Object.defineProperty(window, "innerWidth", { value: 800 });
    const close = vi.fn();
    const view = render(<Panel direction="left" onClose={close} />);
    const title = screen.getByText("Panel title");
    expect(swipe(title, -90, 0).moved).toBe(true);
    expect(close).not.toHaveBeenCalled();
    view.rerender(<Panel direction="left" breakpoint={1024} onClose={close} />);
    const scroll = screen.getByTestId("scroll");
    Object.defineProperties(scroll, { scrollWidth: { value: 500 }, clientWidth: { value: 200 } });
    expect(swipe(screen.getByText("Scrollable text"), -90, 0).moved).toBe(true);
    expect(close).not.toHaveBeenCalled();
    expect(swipe(title, -90, 0).moved).toBe(false);
    expect(close).toHaveBeenCalledOnce();
  });
});
