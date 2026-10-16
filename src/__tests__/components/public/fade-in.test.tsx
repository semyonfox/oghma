// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import FadeIn from "@/components/public/fade-in";

let intersect: ((entries: Array<{ isIntersecting: boolean }>) => void) | null = null;

class FakeIntersectionObserver {
  constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
    intersect = callback;
  }
  observe() {}
  disconnect() {}
}

afterEach(() => {
  cleanup();
  intersect = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("server-renders visible content so the first paint never waits on hydration", () => {
  const html = renderToString(<FadeIn>Hero copy</FadeIn>);
  expect(html).toContain("opacity:1");
  expect(html).not.toContain("opacity:0");
});

it("keeps content already on screen visible after hydration", () => {
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  render(<FadeIn>Above the fold</FadeIn>);
  expect(screen.getByText("Above the fold").style.opacity).toBe("1");
});

it("hides content below the fold until it scrolls into view", () => {
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, window.innerHeight + 400, 100, 100),
  );
  render(<FadeIn>Below the fold</FadeIn>);
  const element = screen.getByText("Below the fold");
  expect(element.style.opacity).toBe("0");

  act(() => intersect?.([{ isIntersecting: true }]));
  expect(element.style.opacity).toBe("1");
});
