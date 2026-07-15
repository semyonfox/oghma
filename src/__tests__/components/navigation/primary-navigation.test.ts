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

import PrimaryNavigation from "@/components/navigation/primary-navigation";

describe("PrimaryNavigation AI chat entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = "/notes";
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
});
