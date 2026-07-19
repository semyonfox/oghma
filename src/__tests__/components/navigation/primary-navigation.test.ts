// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    push: vi.fn(),
    setActiveNav: vi.fn(),
    openRightPanelTab: vi.fn(),
    globalSearchOpen: vi.fn(),
    pathname: "/notes",
    pomodoroStart: vi.fn(),
    pomodoroPhase: "idle",
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  usePathname: () => mocks.pathname,
}));

vi.mock("@/lib/notes/state/layout.zustand", () => {
  const state = {
    activeNav: "notes",
    setActiveNav: mocks.setActiveNav,
    rightPanelOpen: true,
    rightPanelTab: "ai",
    openRightPanelTab: mocks.openRightPanelTab,
  };
  return {
    __esModule: true,
    default: (selector: (value: typeof state) => unknown) => selector(state),
  };
});

vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  __esModule: true,
  default: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/lib/global-search/state", () => ({
  __esModule: true,
  default: {
    getState: () => ({ open: mocks.globalSearchOpen }),
  },
}));

vi.mock("@/lib/notes/state/pomodoro.zustand", () => ({
  __esModule: true,
  default: (selector: (value: unknown) => unknown) =>
    selector({ phase: mocks.pomodoroPhase, start: mocks.pomodoroStart }),
}));

import PrimaryNavigation from "@/components/navigation/primary-navigation";

describe("PrimaryNavigation AI chat entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = "/notes";
    mocks.pomodoroPhase = "idle";
  });

  it("opens a fresh full-screen chat from the navigation rail", async () => {
    render(React.createElement(PrimaryNavigation));

    fireEvent.click(screen.getByTitle("AI Chat"));

    expect(mocks.setActiveNav).toHaveBeenCalledWith("chat");
    expect(mocks.push).toHaveBeenCalledWith("/chat");
    expect(mocks.openRightPanelTab).not.toHaveBeenCalled();
  });

  it("opens global search from the navigation rail", async () => {
    render(React.createElement(PrimaryNavigation));

    fireEvent.click(screen.getByTitle("Search"));

    expect(mocks.globalSearchOpen).toHaveBeenCalledTimes(1);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("identifies the current destination accessibly", () => {
    render(React.createElement(PrimaryNavigation));

    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "AI Chat" }).getAttribute("aria-current"),
    ).toBe("page");
  });

  it("renders labelled drawer navigation and closes after an action", () => {
    const onNavigate = vi.fn();
    render(
      React.createElement(PrimaryNavigation, {
        variant: "drawer",
        onNavigate,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(mocks.globalSearchOpen).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Calendar")).toBeTruthy();
  });

  it("starts a generic focus session from the navigation rail", () => {
    render(React.createElement(PrimaryNavigation));

    fireEvent.click(screen.getByRole("button", { name: "Focus" }));

    expect(mocks.pomodoroStart).toHaveBeenCalledTimes(1);
    expect(mocks.pomodoroStart).toHaveBeenCalledWith({});
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("disables the focus button while a session is running", () => {
    mocks.pomodoroPhase = "focus";
    render(React.createElement(PrimaryNavigation));

    const button = screen.getByRole("button", {
      name: "Focus",
    }) as HTMLButtonElement;

    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.getAttribute("title")).toBe("Focus session in progress");

    fireEvent.click(button);
    expect(mocks.pomodoroStart).not.toHaveBeenCalled();
  });

  it("starts a focus session from the drawer and closes it", () => {
    const onNavigate = vi.fn();
    render(
      React.createElement(PrimaryNavigation, {
        variant: "drawer",
        onNavigate,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Focus" }));

    expect(mocks.pomodoroStart).toHaveBeenCalledWith({});
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
