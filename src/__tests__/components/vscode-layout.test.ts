// @vitest-environment jsdom

import React from "react";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pathname: "/notes/550e8400-e29b-41d4-a716-446655440000",
  replace: vi.fn(),
  setPaneA: vi.fn(),
  schedulePrefetch: vi.fn(),
}));

const layoutState = {
  treeWidth: 220,
  rightPanelWidth: 280,
  rightPanelOpen: false,
  paneA: { fileId: "", fileType: "note" },
  paneB: null,
  activePane: "A",
  setPaneA: mocks.setPaneA,
  setActivePane: vi.fn(),
  toggleRightPanel: vi.fn(),
};

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("@/lib/notes/state/layout.zustand", () => {
  const useLayoutStore = (selector: (state: typeof layoutState) => unknown) =>
    selector(layoutState);
  useLayoutStore.getState = () => layoutState;
  return { __esModule: true, default: useLayoutStore };
});

vi.mock("@/lib/notes/state/tree", () => ({
  __esModule: true,
  default: (selector: (state: { initLoaded: boolean }) => unknown) =>
    selector({ initLoaded: false }),
}));

vi.mock("@/lib/notes/prefetch", () => ({
  schedulePrefetch: mocks.schedulePrefetch,
}));

vi.mock("@/components/sidebar/icon-nav", () => ({ default: () => null }));
vi.mock("@/components/sidebar/file-tree-panel", () => ({
  default: () => null,
}));
vi.mock("@/components/editor/split-pane", () => ({ default: () => null }));
vi.mock("@/components/panels/notes-inspector-sidebar", () => ({
  default: () => null,
}));

import VSCodeLayout from "@/components/layout/vscode-layout";

describe("VSCodeLayout note route synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    layoutState.paneA.fileId = "";
  });

  it("assigns a direct note route without fetching note content", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    render(React.createElement(VSCodeLayout));

    await waitFor(() => {
      expect(mocks.setPaneA).toHaveBeenCalledWith({
        fileId: "550e8400-e29b-41d4-a716-446655440000",
        fileType: "note",
        title: "550e8400-e29b-41d4-a716-446655440000",
      });
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});
