// @vitest-environment jsdom

import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pathname: "/notes/550e8400-e29b-41d4-a716-446655440000",
  replace: vi.fn(),
  isDesktop: true,
  schedulePrefetch: vi.fn(),
  treeState: { initLoaded: false, generation: 0 },
}));

vi.mock("react-resizable-panels", () => ({
  Separator: ({ "aria-label": ariaLabel }: { "aria-label"?: string }) =>
    React.createElement("div", { role: "separator", "aria-label": ariaLabel }),
  Group: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  Panel: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
}));

vi.mock("next/navigation", () => {
  const router = { replace: mocks.replace };
  return { usePathname: () => mocks.pathname, useRouter: () => router };
});

vi.mock("@/components/navigation/use-sidebar-summary", () => ({
  default: () => ({ name: "", email: "", avatarUrl: null, dueCount: 0 }),
}));

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

vi.mock("@/components/canvas/canvas-token-banner", () => ({ default: () => null }));
vi.mock("@/components/notes/mobile-library", () => ({
  default: () => React.createElement("div", null, "Mobile library content"),
}));
vi.mock("@/components/notes/note-tree-panel", () => ({
  default: () => React.createElement("div", null, "Library content"),
}));
vi.mock("@/components/editor/split-editor-pane", () => ({
  default: ({ primaryLoading }: { primaryLoading?: boolean }) =>
    primaryLoading
      ? React.createElement("div", { role: "status" }, "Loading note")
      : React.createElement("div", null, "Editor content"),
}));
vi.mock("@/components/notes/note-inspector-panel", () => ({
  default: () => null,
}));
vi.mock("@/components/notes/trash-page", () => ({
  default: () => React.createElement("div", null, "Trash page"),
}));

import NotesWorkspace from "@/components/notes/notes-workspace";
import useLayoutStore, { type FileSpec } from "@/lib/notes/state/layout";

const oldId = "550e8400-e29b-41d4-a716-446655440000";
const newId = "67e55044-10b1-426f-9247-bb680e5fe0c8";

afterEach(() => vi.unstubAllGlobals());

describe("NotesWorkspace note route synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isDesktop = true;
    mocks.treeState.generation = 0;
    mocks.treeState.initLoaded = false;
    mocks.pathname = "/notes/550e8400-e29b-41d4-a716-446655440000";
    useLayoutStore.getState().resetWorkspace();
    useLayoutStore.setState({ rightPanelOpen: false });
    vi.stubGlobal("fetch", vi.fn());
  });

  it("opens the library at the mobile Notes root even with a remembered note", () => {
    mocks.isDesktop = false;
    mocks.pathname = "/notes";
    useLayoutStore.getState().setPaneA({ fileId: oldId, fileType: "note" });
    render(React.createElement(NotesWorkspace));

    expect(screen.getByRole("main", { name: "Notes" })).toBeTruthy();
    expect(screen.getByText("Mobile library content")).toBeTruthy();
    expect(screen.queryByText("Editor content")).toBeNull();
    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeTruthy();
    expect(screen.queryByRole("main", { name: "Note editor" })).toBeNull();
  });

  it("does not prefetch desktop folders and remembered panes on mobile", () => {
    mocks.isDesktop = false;
    mocks.pathname = "/notes";
    mocks.treeState.initLoaded = true;
    useLayoutStore.getState().setPaneA({ fileId: oldId, fileType: "note" });
    render(React.createElement(NotesWorkspace));

    expect(mocks.schedulePrefetch).not.toHaveBeenCalled();
  });

  it("renders resize handles for both desktop side panels", () => {
    useLayoutStore.getState().setPaneA({ fileId: oldId, fileType: "note" });
    useLayoutStore.setState({ rightPanelOpen: true });
    render(React.createElement(NotesWorkspace));

    expect(screen.getByRole("separator", { name: "Resize notes panel" })).toBeTruthy();
    expect(screen.getByRole("separator", { name: "Resize details panel" })).toBeTruthy();
  });

  it("keeps a directly opened mobile note in the editor", () => {
    mocks.isDesktop = false;
    useLayoutStore.getState().setPaneA({ fileId: oldId, fileType: "note" });
    render(React.createElement(NotesWorkspace));

    expect(screen.getByRole("main", { name: "Note editor" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Main navigation" })).toBeNull();
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
      expect(useLayoutStore.getState().paneA).toMatchObject({
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

  it("blocks the old primary editor during Back and Forward", async () => {
    useLayoutStore.getState().setPaneA({ fileId: oldId, fileType: "note" });
    const { rerender } = render(React.createElement(NotesWorkspace));
    expect(await screen.findByText("Editor content")).toBeTruthy();

    for (const id of [newId, oldId]) {
      const reply = Promise.withResolvers<Response>();
      vi.mocked(fetch).mockReturnValueOnce(reply.promise);
      mocks.pathname = `/notes/${id}`;
      rerender(React.createElement(NotesWorkspace));
      expect(screen.getByRole("status").textContent).toBe("Loading note");
      expect(screen.queryByText("Editor content")).toBeNull();

      await act(async () => reply.resolve(Response.json({ id, title: "History route" })));
      expect(useLayoutStore.getState().paneA.fileId).toBe(id);
      expect(screen.getByText("Editor content")).toBeTruthy();
    }
  });

  it("does not fetch or block when a tree click sets the primary pane first", () => {
    useLayoutStore.getState().setPaneA({ fileId: oldId, fileType: "note" });
    const { rerender } = render(React.createElement(NotesWorkspace));
    act(() => useLayoutStore.getState().setPaneA({ fileId: newId, fileType: "note" }));
    expect(screen.getByText("Editor content")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();

    mocks.pathname = `/notes/${newId}`;
    rerender(React.createElement(NotesWorkspace));
    expect(screen.getByText("Editor content")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps a split-pane swap even when the pathname stays on the old primary note", () => {
    const primary = { fileId: oldId, fileType: "note" } satisfies FileSpec;
    const secondary = { fileId: newId, fileType: "note" } satisfies FileSpec;
    useLayoutStore.getState().setPaneA(primary);
    useLayoutStore.getState().setPaneB(secondary);
    render(React.createElement(NotesWorkspace));

    act(() => useLayoutStore.getState().placeFileInPane(secondary, "A", "B"));

    expect(useLayoutStore.getState().paneA.fileId).toBe(newId);
    expect(useLayoutStore.getState().paneB?.fileId).toBe(oldId);
    expect(screen.getByText("Editor content")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
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
      expect(useLayoutStore.getState().paneA).toMatchObject({
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

    expect(useLayoutStore.getState().paneA.fileId).toBe(newId);
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
    await waitFor(() => expect(useLayoutStore.getState().paneA.fileId).toBe(newId));

    await act(async () => {
      resolveOldResponse?.(new Response(null, { status: 404 }));
      await oldResponse;
    });

    expect(mocks.replace).not.toHaveBeenCalled();
    expect(useLayoutStore.getState().paneA.fileId).toBe(newId);
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

    expect(useLayoutStore.getState().paneA.fileId).toBe("");
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("renders Trash without treating its reserved route as a note id", async () => {
    mocks.pathname = "/notes/trash";

    render(React.createElement(NotesWorkspace, { view: "trash" }));

    expect(screen.getByRole("main", { name: "Trash" })).toBeTruthy();
    expect(await screen.findByText("Trash page")).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "keeps the editor position when the inspector toggles, desktop=%s",
    (isDesktop) => {
      mocks.isDesktop = isDesktop;
      useLayoutStore.getState().setPaneA({ fileId: oldId, fileType: "note" });
      render(React.createElement(NotesWorkspace));
      const editor = screen.getByText("Editor content");
      editor.scrollTop = 900;

      act(() => useLayoutStore.setState({ rightPanelOpen: true }));
      expect(screen.getByText("Editor content")).toBe(editor);
      expect(editor.scrollTop).toBe(900);

      act(() => useLayoutStore.setState({ rightPanelOpen: false }));
      expect(screen.getByText("Editor content")).toBe(editor);
      expect(editor.scrollTop).toBe(900);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});
