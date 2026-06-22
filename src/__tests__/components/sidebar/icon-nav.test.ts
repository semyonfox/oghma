// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    push: vi.fn(),
    setActiveNav: vi.fn(),
    openRightPanelTab: vi.fn(),
    searchOpen: vi.fn(),
    pathname: "/notes",
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  usePathname: () => mocks.pathname,
}));

vi.mock("@/lib/notes/state/layout.zustand", () => ({
  __esModule: true,
  default: () => ({
    activeNav: "notes",
    setActiveNav: mocks.setActiveNav,
    rightPanelOpen: true,
    rightPanelTab: "ai",
    openRightPanelTab: mocks.openRightPanelTab,
  }),
}));

vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  __esModule: true,
  default: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/lib/notes/state/portal", () => ({
  __esModule: true,
  default: {
    getState: () => ({
      search: {
        open: mocks.searchOpen,
      },
    }),
  },
}));

import IconNav from "@/components/sidebar/icon-nav";

describe("IconNav AI chat entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = "/notes";
  });

  it("opens a fresh full-screen chat from the sidebar", async () => {
    render(React.createElement(IconNav));

    fireEvent.click(screen.getByTitle("AI Chat"));

    expect(mocks.setActiveNav).toHaveBeenCalledWith("chat");
    expect(mocks.push).toHaveBeenCalledWith("/chat");
    expect(mocks.openRightPanelTab).not.toHaveBeenCalled();
  });
});
