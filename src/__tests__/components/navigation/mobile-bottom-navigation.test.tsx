// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
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

    expect(container.querySelector("nav")?.className).toContain("hidden");

    input.blur();
    expect(container.querySelector("nav")?.className).toContain("flex");
    unmount();
    input.remove();

    expect(viewport.removeEventListener).toHaveBeenCalledWith("resize", resize);
  });
});
