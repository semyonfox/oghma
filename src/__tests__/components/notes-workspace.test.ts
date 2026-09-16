// @vitest-environment jsdom

import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pathname: "/notes/550e8400-e29b-41d4-a716-446655440000",
  replace: vi.fn(),
  setPaneA: vi.fn(),
  schedulePrefetch: vi.fn(),
  isDesktop: true,
  treeState: { initLoaded: false, generation: 0 },
}));

const layoutState = {
  treeWidth: 220,
  rightPanelWidth: 280,
  rightPanelOpen: false,
  rightPanelTab: "meta" as const,
  splitPosition: 50,
  paneA: { fileId: "", fileType: "note" },
  paneB: null,
  activePane: "A",
  setPaneA: mocks.setPaneA,
  setActivePane: vi.fn(),
  setRightPanelOpen: vi.fn(),
  setSizes: vi.fn(),
};

vi.mock("react-resizable-panels", () => ({
  Group: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  Panel: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  Separator: ({ "aria-label": ariaLabel }: { "aria-label"?: string }) =>
    React.createElement("div", { role: "separator", "aria-label": ariaLabel }),
}));

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

vi.mock("@/lib/notes/state/tree", () => {
  const useTreeStore = (selector: (state: typeof mocks.treeState) => unknown) =>
    selector(mocks.treeState);
  useTreeStore.getState = () => mocks.treeState;
  return { __esModule: true, default: useTreeStore };
});

vi.mock("@/lib/notes/prefetch", () => ({
  schedulePrefetch: mocks.schedulePrefetch,
}));

vi.mock("@/lib/hooks/use-media-query", () => ({
  __esModule: true,
  default: () => mocks.isDesktop,
}));

vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  __esModule: true,
  default: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/notes/hooks/use-note-tree-initialization", () => ({
  __esModule: true,
  default: () => true,
}));

vi.mock("@/components/navigation/primary-navigation", () => ({
  default: () => null,
}));
vi.mock("@/components/navigation/mobile-app-header", () => ({
  default: () => null,
}));
vi.mock("@/components/navigation/mobile-drawer", () => ({
  default: () => null,
}));
vi.mock("@/components/navigation/mobile-bottom-navigation", () => ({
  default: () => React.createElement("nav", null, "Mobile navigation"),
}));
vi.mock("@/components/notes/mobile-library", () => ({
  default: () => React.createElement("div", null, "Mobile library content"),
}));
vi.mock("@/components/notes/note-tree-panel", () => ({
  default: () => React.createElement("div", null, "Library content"),
}));
vi.mock("@/components/editor/split-editor-pane", () => ({
  default: () => React.createElement("div", null, "Editor content"),
}));
vi.mock("@/components/notes/note-inspector-panel", () => ({
  default: () => null,
}));
vi.mock("@/components/notes/trash-page", () => ({
  default: () => React.createElement("div", null, "Trash page"),
}));

import NotesWorkspace from "@/components/notes/notes-workspace";

describe("NotesWorkspace note route synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isDesktop = true;
    mocks.treeState.generation = 0;
    mocks.treeState.initLoaded = false;
    mocks.pathname = "/notes/550e8400-e29b-41d4-a716-446655440000";
    layoutState.paneA.fileId = "";
    layoutState.rightPanelOpen = false;
    vi.stubGlobal("fetch", vi.fn());
  });

  it("opens the library at the mobile Notes root even with a remembered note", () => {
    mocks.isDesktop = false;
    mocks.pathname = "/notes";
    layoutState.paneA.fileId = "550e8400-e29b-41d4-a716-446655440000";
    render(React.createElement(NotesWorkspace));
    expect(screen.getByText("Mobile library content")).toBeTruthy();
    expect(screen.getByText("Mobile navigation")).toBeTruthy();
    expect(screen.queryByText("Library content")).toBeNull();
    expect(screen.queryByText("Editor content")).toBeNull();
  });

  it("keeps a directly opened mobile note in the editor", async () => {
    mocks.isDesktop = false;
    layoutState.paneA.fileId = "550e8400-e29b-41d4-a716-446655440000";
    render(React.createElement(NotesWorkspace));
    expect(await screen.findByText("Editor content")).toBeTruthy();
    expect(screen.queryByText("Mobile navigation")).toBeNull();
    expect(screen.queryByText("Library content")).toBeNull();
  });

  it("does not prefetch desktop folders and remembered panes on mobile", () => {
    mocks.isDesktop = false;
    mocks.pathname = "/notes";
    mocks.treeState.initLoaded = true;
    render(React.createElement(NotesWorkspace));
    expect(mocks.schedulePrefetch).not.toHaveBeenCalled();
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

  it("ignores a previous route response after navigating to another note", async () => {
    let resolveOldJson: ((note: unknown) => void) | undefined;
    const oldJson = new Promise<unknown>((resolve) => {
      resolveOldJson = resolve;
    });
    const oldResponse = Response.json(null);
    vi.spyOn(oldResponse, "json").mockReturnValue(oldJson);
    vi.mocked(fetch)
      .mockResolvedValueOnce(oldResponse)
      .mockResolvedValueOnce(
        Response.json({
          id: "67e55044-10b1-426f-9247-bb680e5fe0c8",
          title: "New route",
          content: "",
        }),
      );

    const { rerender } = render(React.createElement(NotesWorkspace));
    await waitFor(() => expect(oldResponse.json).toHaveBeenCalledOnce());

    mocks.pathname = "/notes/67e55044-10b1-426f-9247-bb680e5fe0c8";
    rerender(React.createElement(NotesWorkspace));
    await waitFor(() =>
      expect(mocks.setPaneA).toHaveBeenCalledWith({
        fileId: "67e55044-10b1-426f-9247-bb680e5fe0c8",
        fileType: "note",
        title: "New route",
      }),
    );

    await act(async () => {
      resolveOldJson?.({
        id: "550e8400-e29b-41d4-a716-446655440000",
        title: "Old route",
        content: "",
      });
      await oldJson;
    });

    expect(mocks.setPaneA).toHaveBeenCalledOnce();
  });

  it("ignores a previous route 404 after navigating to another note", async () => {
    let resolveOldResponse: ((response: Response) => void) | undefined;
    const oldResponse = new Promise<Response>((resolve) => {
      resolveOldResponse = resolve;
    });
    vi.mocked(fetch)
      .mockImplementationOnce(() => oldResponse)
      .mockResolvedValueOnce(
        Response.json({
          id: "67e55044-10b1-426f-9247-bb680e5fe0c8",
          title: "New route",
          content: "",
        }),
      );

    const { rerender } = render(React.createElement(NotesWorkspace));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());

    mocks.pathname = "/notes/67e55044-10b1-426f-9247-bb680e5fe0c8";
    rerender(React.createElement(NotesWorkspace));
    await waitFor(() => expect(mocks.setPaneA).toHaveBeenCalledOnce());

    await act(async () => {
      resolveOldResponse?.(new Response(null, { status: 404 }));
      await oldResponse;
    });

    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.setPaneA).toHaveBeenCalledOnce();
  });

  it("rejects a route response when the store resets before React rerenders", async () => {
    let resolveResponse!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );
    render(React.createElement(NotesWorkspace));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());

    mocks.treeState.generation += 1;
    await act(async () => {
      resolveResponse(
        Response.json({
          id: "550e8400-e29b-41d4-a716-446655440000",
          title: "Previous workspace",
          content: "",
        }),
      );
    });

    expect(mocks.setPaneA).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("renders resize handles for both desktop side panels", () => {
    layoutState.paneA.fileId = "550e8400-e29b-41d4-a716-446655440000";
    layoutState.rightPanelOpen = true;

    render(React.createElement(NotesWorkspace));

    expect(
      screen.getByRole("separator", { name: "Resize notes panel" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("separator", { name: "Resize details panel" }),
    ).toBeTruthy();
  });

  it("renders Trash without treating its reserved route as a note id", async () => {
    mocks.pathname = "/notes/trash";

    render(React.createElement(NotesWorkspace, { view: "trash" }));

    expect(await screen.findByText("Trash page")).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "keeps the editor position when the inspector toggles, desktop=%s",
    (isDesktop) => {
      mocks.isDesktop = isDesktop;
      layoutState.paneA.fileId = "550e8400-e29b-41d4-a716-446655440000";
      const { rerender } = render(React.createElement(NotesWorkspace));
      const editor = screen.getByText("Editor content");
      editor.scrollTop = 900;

      layoutState.rightPanelOpen = true;
      rerender(React.createElement(NotesWorkspace));
      expect(screen.getByText("Editor content")).toBe(editor);
      expect(editor.scrollTop).toBe(900);

      layoutState.rightPanelOpen = false;
      rerender(React.createElement(NotesWorkspace));
      expect(screen.getByText("Editor content")).toBe(editor);
      expect(editor.scrollTop).toBe(900);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});
