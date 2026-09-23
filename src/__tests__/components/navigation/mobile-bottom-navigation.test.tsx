// @vitest-environment jsdom

import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  globalSearchOpen: vi.fn(),
  pomodoroStart: vi.fn(),
  pathname: "/notes",
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    onClick,
    prefetch: _prefetch,
    ...props
  }: React.ComponentProps<"a"> & { prefetch?: boolean }) => (
    <a
      href={href}
      {...props}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
      }}
    >
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));
vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  __esModule: true,
  default: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/global-search/state", () => ({
  __esModule: true,
  default: { getState: () => ({ open: mocks.globalSearchOpen }) },
}));
vi.mock("@/lib/notes/state/pomodoro.zustand", () => ({
  __esModule: true,
  default: (
    selector: (state: {
      phase: string;
      start: typeof mocks.pomodoroStart;
    }) => unknown,
  ) => selector({ phase: "idle", start: mocks.pomodoroStart }),
}));
vi.mock("@/lib/native-app", () => ({
  useNativeAppBridge: () => false,
  supportsNativeOffline: () => false,
  postNativeOfflineOpen: vi.fn(),
}));
vi.mock("@/components/canvas/canvas-import-indicator", () => ({
  default: () => null,
}));
vi.mock("@/components/navigation/mobile-sheet", () => ({
  default: ({
    open,
    onClose,
    title,
    children,
  }: {
    open: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
  }) =>
    open ? (
      <section role="dialog" aria-label={title}>
        <button onClick={onClose}>Close sheet</button>
        {children}
      </section>
    ) : null,
}));

import MobileBottomNavigation from "@/components/navigation/mobile-bottom-navigation";

type Viewport = {
  height: number;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
};

describe("MobileBottomNavigation", () => {
  let viewport: Viewport;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = "/notes";
    viewport = {
      height: 800,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 800,
    });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: viewport,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: undefined,
    });
  });

  it("renders the mobile destinations and identifies the current route", () => {
    render(<MobileBottomNavigation />);

    expect(
      screen.getByRole("link", { name: "Notes" }).getAttribute("href"),
    ).toBe("/notes");
    expect(
      screen.getByRole("link", { name: "AI Chat" }).getAttribute("href"),
    ).toBe("/chat");
    expect(
      screen.getByRole("link", { name: "Calendar" }).getAttribute("href"),
    ).toBe("/calendar");
    expect(
      screen.getByRole("link", { name: "quiz.title" }).getAttribute("href"),
    ).toBe("/quiz");
    expect(
      screen.getByRole("link", { name: "Notes" }).getAttribute("aria-current"),
    ).toBe("page");
  });

  it("contracts on downward scrolling and expands on upward scroll, focus, and navigation", () => {
    const view = render(
      <div>
        <main data-testid="scroll-panel" />
        <MobileBottomNavigation />
      </div>,
    );
    const panel = screen.getByTestId("scroll-panel");
    const nav = screen.getByRole("navigation");
    const scrollTo = (top: number) => {
      panel.scrollTop = top;
      fireEvent.scroll(panel);
    };
    expect(nav.getAttribute("data-expanded")).toBe("true");
    scrollTo(80);
    expect(nav.getAttribute("data-expanded")).toBe("false");
    expect(screen.getByRole("link", { name: "AI Chat" })).toBeTruthy();
    scrollTo(75);
    expect(nav.getAttribute("data-expanded")).toBe("true");
    scrollTo(120);
    const notesLink = screen.getByRole("link", { name: "Notes" });
    // jsdom does not model keyboard-driven :focus-visible matching.
    vi.spyOn(notesLink, "matches").mockReturnValueOnce(true);
    act(() => notesLink.focus());
    expect(nav.getAttribute("data-expanded")).toBe("true");
    scrollTo(160);
    mocks.pathname = "/chat";
    view.rerender(<div><main data-testid="scroll-panel" /><MobileBottomNavigation /></div>);
    expect(nav.getAttribute("data-expanded")).toBe("true");
    expect(screen.getByRole("link", { name: "AI Chat" }).getAttribute("aria-current")).toBe("page");
  });

  it("ignores scrolling in text inputs and open sheets", () => {
    render(
      <div>
        <textarea aria-label="Draft" />
        <section role="dialog" aria-label="Other sheet"><div data-testid="sheet-scroll" /></section>
        <MobileBottomNavigation />
      </div>,
    );
    for (const element of [screen.getByRole("textbox"), screen.getByTestId("sheet-scroll")]) {
      element.scrollTop = 100;
      fireEvent.scroll(element);
    }
    expect(screen.getByRole("navigation").getAttribute("data-expanded")).toBe("true");
  });

  it("closes More before opening search or following a More destination", () => {
    render(<MobileBottomNavigation />);

    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("dialog", { name: "More" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Search OghmaNotes" }));
    expect(mocks.globalSearchOpen).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "More" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "More" }));
    const settings = screen.getByRole("link", { name: "Settings" });
    expect(settings.getAttribute("href")).toBe("/settings");
    fireEvent.click(settings);
    expect(screen.queryByRole("dialog", { name: "More" })).toBeNull();
  });

  it("hides while the visual viewport contracts for an active text editor and cleans up listeners", () => {
    const { container, unmount } = render(<MobileBottomNavigation />);
    const input = document.createElement("input");
    document.body.append(input);

    input.focus();
    viewport.height = 640;
    const resize = viewport.addEventListener.mock.calls.find(
      ([event]) => event === "resize",
    )?.[1] as EventListener;
    resize(new Event("resize"));

    expect(container.querySelector("nav")?.parentElement?.className).toContain("hidden");

    input.blur();
    expect(container.querySelector("nav")?.parentElement?.className).toContain("block");
    unmount();
    input.remove();

    expect(viewport.removeEventListener).toHaveBeenCalledWith("resize", resize);
  });
});
