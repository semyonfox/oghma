// @vitest-environment jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pathname: "/",
  renderDeferredModal: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock("next/dynamic", () => ({
  default: () => () => {
    mocks.renderDeferredModal();
    return React.createElement("div", { "data-testid": "global-search-modal" });
  },
}));

import GlobalSearchRoot from "@/components/search/global-search-root";
import { isGlobalSearchRoute } from "@/lib/global-search/routes";

describe("global search route boundary", () => {
  beforeEach(() => {
    mocks.pathname = "/";
    mocks.renderDeferredModal.mockClear();
  });

  it("recognizes only the existing workspace path prefixes", () => {
    expect(isGlobalSearchRoute("/notes/note-1")).toBe(true);
    expect(isGlobalSearchRoute("/quiz/session/session-1")).toBe(true);
    expect(isGlobalSearchRoute("/settings#ai")).toBe(true);
    expect(isGlobalSearchRoute("/about")).toBe(false);
    expect(isGlobalSearchRoute(null)).toBe(false);
  });

  it("does not render the deferred modal on a public route", () => {
    render(React.createElement(GlobalSearchRoot));

    expect(screen.queryByTestId("global-search-modal")).toBeNull();
    expect(mocks.renderDeferredModal).not.toHaveBeenCalled();
  });

  it("renders the deferred modal on a workspace route", () => {
    mocks.pathname = "/notes";

    render(React.createElement(GlobalSearchRoot));

    expect(screen.getByTestId("global-search-modal")).toBeTruthy();
    expect(mocks.renderDeferredModal).toHaveBeenCalledOnce();
  });
});
