// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pathname: "/",
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("next/dynamic", async () => {
  const { default: Modal } = await import("@/components/search/global-search-modal");
  return { default: () => Modal };
});

import { withI18n } from "@/__tests__/test-utils/i18n";
import GlobalSearchRoot from "@/components/search/global-search-root";
import { isGlobalSearchRoute } from "@/lib/global-search/routes";
import useGlobalSearchStore from "@/lib/global-search/state";

describe("global search route boundary", () => {
  const scrollIntoView = HTMLElement.prototype.scrollIntoView;

  beforeEach(() => {
    mocks.pathname = "/";
    HTMLElement.prototype.scrollIntoView = () => {};
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({})));
    useGlobalSearchStore.getState().close();
  });

  afterEach(() => {
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    vi.unstubAllGlobals();
  });

  it("recognizes only the existing workspace path prefixes", () => {
    expect(isGlobalSearchRoute("/notes/note-1")).toBe(true);
    expect(isGlobalSearchRoute("/quiz/session/session-1")).toBe(true);
    expect(isGlobalSearchRoute("/settings#ai")).toBe(true);
    expect(isGlobalSearchRoute("/study-map/topic-1")).toBe(true);
    expect(isGlobalSearchRoute("/about")).toBe(false);
    expect(isGlobalSearchRoute(null)).toBe(false);
  });

  it("matches whole path segments only", () => {
    expect(isGlobalSearchRoute("/notes-export")).toBe(false);
    expect(isGlobalSearchRoute("/chatroom")).toBe(false);
  });

  it("keeps search open when the navigation opens it on the study map", async () => {
    mocks.pathname = "/study-map";

    render(withI18n(<GlobalSearchRoot />));
    act(() => useGlobalSearchStore.getState().open());

    await screen.findByRole("dialog");
  });

  it("opens the search dialog from the workspace shortcut", async () => {
    mocks.pathname = "/notes";

    render(withI18n(<GlobalSearchRoot />));

    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.keyDown(document, { key: "k", metaKey: true });

    await screen.findByRole("dialog");
  });

  it("does not open search from the shortcut on a public route", () => {
    mocks.pathname = "/about";

    render(withI18n(<GlobalSearchRoot />));
    expect(fireEvent.keyDown(document, { key: "k", ctrlKey: true })).toBe(true);
    act(() => useGlobalSearchStore.getState().open());
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
