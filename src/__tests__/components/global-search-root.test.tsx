// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
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
import useGlobalSearchStore from "@/lib/global-search/state";

describe("global search route boundary", () => {
  beforeEach(() => {
    mocks.pathname = "/";
    mocks.renderDeferredModal.mockClear();
    useGlobalSearchStore.getState().close();
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

  it("loads the deferred modal only after the workspace shortcut opens search", () => {
    mocks.pathname = "/notes";

    render(React.createElement(GlobalSearchRoot));

    expect(screen.queryByTestId("global-search-modal")).toBeNull();
    expect(mocks.renderDeferredModal).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: "k", metaKey: true });

    expect(screen.getByTestId("global-search-modal")).toBeTruthy();
    expect(mocks.renderDeferredModal).toHaveBeenCalledOnce();
  });

  it("does not open search from the shortcut on a public route", () => {
    mocks.pathname = "/about";

    render(React.createElement(GlobalSearchRoot));
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });

    expect(useGlobalSearchStore.getState().visible).toBe(false);
  });
});
