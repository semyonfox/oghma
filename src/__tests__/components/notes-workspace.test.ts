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

vi.mock("@/components/navigation/primary-navigation", () => ({ default: () => null }));
vi.mock("@/components/notes/note-tree-panel", () => ({
  default: () => null,
}));
vi.mock("@/components/editor/split-editor-pane", () => ({ default: () => null }));
vi.mock("@/components/notes/note-inspector-panel", () => ({
  default: () => null,
}));

import NotesWorkspace from "@/components/notes/notes-workspace";

describe("NotesWorkspace note route synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    layoutState.paneA.fileId = "";
    vi.stubGlobal("fetch", vi.fn());
  });

  it("hydrates a direct PDF route before choosing its renderer", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "550e8400-e29b-41d4-a716-446655440000",
          title: "lecture.pdf",
          content: "",
          s3Key: "notes/550e8400-e29b-41d4-a716-446655440000/lecture.pdf",
        }),
      ),
    );

    render(React.createElement(NotesWorkspace));

    await waitFor(() => {
      expect(mocks.setPaneA).toHaveBeenCalledWith({
        fileId: "550e8400-e29b-41d4-a716-446655440000",
        fileType: "pdf",
        title: "lecture.pdf",
        sourcePath: "notes/550e8400-e29b-41d4-a716-446655440000/lecture.pdf",
      });
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/notes/550e8400-e29b-41d4-a716-446655440000",
      { signal: expect.any(AbortSignal) },
    );
  });
});
