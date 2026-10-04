// @vitest-environment jsdom

import React from "react";
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchNote: vi.fn(),
  mutateNote: vi.fn(),
  cache: new Map<string, unknown>(),
  router: { push: vi.fn(), replace: vi.fn() },
  t: (key: string) => key,
  setSettings: vi.fn(),
  failDraftWrite: false,
}));

vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("next/dynamic", () => ({
  default: () => function WritingSurface(props: {
    value: string;
    onChange: (value: string, programmatic: boolean) => void;
    onSave: () => void;
  }) {
    return <textarea aria-label="content" value={props.value}
      onKeyDownCapture={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          props.onSave();
        }
      }}
      onChange={(event) => props.onChange(event.target.value, false)} />;
  },
}));
vi.mock("@/lib/notes/state/note", () => ({
  default: (selector: (state: {
    fetchNote: typeof mocks.fetchNote;
    mutateNote: typeof mocks.mutateNote;
  }) => unknown) => selector(mocks),
}));
vi.mock("@/lib/notes/state/ui/settings", () => ({
  useSettingsStore: (selector: (state: {
    settings: { editorsize: string };
    setSettings: typeof mocks.setSettings;
  }) => unknown) => selector({ settings: { editorsize: "normal" }, setSettings: mocks.setSettings }),
}));
vi.mock("@/lib/notes/hooks/use-i18n", () => ({ default: () => ({ t: mocks.t }) }));
vi.mock("sonner", () => ({ toast: { info: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/notes/cache", () => ({
  noteCacheInstance: { getItem: async () => undefined },
  uiCache: {
    getItem: async (key: string) => mocks.cache.get(key),
    setItem: async (key: string, value: unknown) => { if (mocks.failDraftWrite) throw new Error("synthetic storage unavailable"); mocks.cache.set(key, value); },
    getOrMoveItem: async (key: string, fallbackKey: string, canMove: () => boolean) => {
      if (!mocks.cache.has(key) && mocks.cache.has(fallbackKey) && canMove()) {
        mocks.cache.set(key, mocks.cache.get(fallbackKey));
        mocks.cache.delete(fallbackKey);
      }
      return mocks.cache.get(key);
    },
    removeItemIf: async (key: string, matches: (value: unknown) => boolean) => {
      if (matches(mocks.cache.get(key))) mocks.cache.delete(key);
    },
  },
}));

import MarkdownEditor from "@/components/editor/markdown-editor";
import useLayoutStore from "@/lib/notes/state/layout.zustand";
import useSaveIndicatorStore, { saveIndicatorKey } from "@/lib/notes/state/save-indicator";
import { readDraft, waitForDraftWrites } from "@/lib/notes/draft-cache";

const file = { fileId: "same-note", fileType: "note" as const };

function deferredSave() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function savePane(pane: "A" | "B") {
  await act(async () => {
    const layout = useLayoutStore.getState();
    const spec = pane === "A" ? layout.paneA : layout.paneB;
    const key = spec?.fileId ? saveIndicatorKey(spec.fileId, spec.draftOwner ?? pane)
      : Object.keys(useSaveIndicatorStore.getState().files).find((key) => pane === "B" ? key.endsWith(":B") : !key.endsWith(":B"));
    if (key) useSaveIndicatorStore.getState().files[key]?.save();
    await waitForDraftWrites();
  });
}

describe("markdown editor recovery ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cache.clear();
    mocks.failDraftWrite = false;
    mocks.fetchNote.mockResolvedValue({ content: "server", updatedAt: "2026-01-01T00:00:00Z" });
    mocks.mutateNote.mockResolvedValue(undefined);
    useSaveIndicatorStore.setState({ files: {} });
    useLayoutStore.setState({
      activePane: "A",
      paneA: { fileId: "", fileType: "note" },
      paneB: null,
    });
  });

  afterEach(() => { cleanup(); });

  it("saves to the server when local draft storage is unavailable", async () => {
    const view = render(<MarkdownEditor pane="A" file={file} />);
    await waitFor(() => expect(view.getByRole("textbox")).toBeTruthy());
    mocks.failDraftWrite = true;
    fireEvent.change(view.getByRole("textbox"), { target: { value: "cloud copy" } });
    await savePane("A");
    await waitFor(() => expect(mocks.mutateNote).toHaveBeenCalledWith(file.fileId, { content: "cloud copy" }));
    await waitFor(() => expect(useSaveIndicatorStore.getState().files[file.fileId]?.state).toBe("saved"));
  });

  it("keeps a focused save action available instead of starting a blur save", async () => {
    const view = render(<div><MarkdownEditor pane="A" file={file} /><button data-save-action>Save changes</button></div>);
    await waitFor(() => expect(view.getByRole("textbox")).toBeTruthy());
    fireEvent.change(view.getByRole("textbox"), { target: { value: "keyboard edit" } });
    fireEvent.blur(view.getByRole("textbox"), { relatedTarget: view.getByRole("button") });
    expect(mocks.mutateNote).not.toHaveBeenCalled();
    expect(useSaveIndicatorStore.getState().files[file.fileId]?.state).toBe("dirty");
    await savePane("A");
    await waitFor(() => expect(mocks.mutateNote).toHaveBeenCalledOnce());
  });

  it("saving A preserves B's divergent draft through unmount and recovery", async () => {
    const saveA = deferredSave();
    const saveB = deferredSave();
    mocks.mutateNote.mockImplementation((_id, change: { content: string }) =>
      change.content === "draft A" ? saveA.promise : saveB.promise,
    );
    const view = render(<>
      <div data-testid="A"><MarkdownEditor pane="A" file={file} /></div>
      <div data-testid="B"><MarkdownEditor pane="B" file={file} /></div>
    </>);
    await waitFor(() => expect(view.getAllByRole("textbox")).toHaveLength(2));
    fireEvent.change(within(view.getByTestId("A")).getByRole("textbox"), { target: { value: "draft A" } });
    fireEvent.change(within(view.getByTestId("B")).getByRole("textbox"), { target: { value: "draft B" } });
    await savePane("A");
    await savePane("B");
    expect((await readDraft(file.fileId, "A"))?.content).toBe("draft A");
    expect((await readDraft(file.fileId, "B"))?.content).toBe("draft B");

    await act(async () => { saveA.resolve(); });
    expect(await readDraft(file.fileId, "A")).toBeNull();
    expect((await readDraft(file.fileId, "B"))?.content).toBe("draft B");
    view.unmount();
    const recovered = render(<MarkdownEditor pane="B" file={file} />);
    await waitFor(() => expect((recovered.getByRole("textbox") as HTMLTextAreaElement).value).toBe("draft B"));
    await act(async () => { saveB.resolve(); });
    expect((await readDraft(file.fileId, "B"))?.content).toBe("draft B");
    expect(useSaveIndicatorStore.getState().files[saveIndicatorKey(file.fileId, "B")]?.state).toBe("dirty");
  });

  it("an older save leaves a later edit dirty and recoverable", async () => {
    const save = deferredSave();
    mocks.mutateNote.mockReturnValue(save.promise);
    const view = render(<MarkdownEditor pane="A" file={file} />);
    await waitFor(() => expect(view.getByRole("textbox")).toBeTruthy());
    fireEvent.change(view.getByRole("textbox"), { target: { value: "saving" } });
    await savePane("A");
    fireEvent.change(view.getByRole("textbox"), { target: { value: "newer" } });
    await act(async () => { save.resolve(); });
    expect(Object.entries(useSaveIndicatorStore.getState().files).find(([key]) => !key.endsWith(":B"))?.[1].state).toBe("dirty");
    view.unmount();
    expect((await readDraft(file.fileId, "A"))?.content).toBe("newer");
  });

  it("a save finishing after a note switch cannot clear the new note's edit", async () => {
    const save = deferredSave();
    mocks.mutateNote.mockReturnValue(save.promise);
    const view = render(<MarkdownEditor pane="A" file={file} />);
    await waitFor(() => expect(view.getByRole("textbox")).toBeTruthy());
    fireEvent.change(view.getByRole("textbox"), { target: { value: "same edit" } });
    await savePane("A");
    view.rerender(<MarkdownEditor pane="A" file={{ ...file, fileId: "next-note" }} />);
    await waitFor(() => expect((view.getByRole("textbox") as HTMLTextAreaElement).value).toBe("server"));
    fireEvent.change(view.getByRole("textbox"), { target: { value: "same edit" } });
    await act(async () => { save.resolve(); });
    expect(Object.entries(useSaveIndicatorStore.getState().files).find(([key]) => !key.endsWith(":B"))?.[1].state).toBe("dirty");
    expect((await readDraft(file.fileId, "A"))?.content).toBe("same edit");
    view.unmount();
    expect((await readDraft("next-note", "A"))?.content).toBe("same edit");
  });

  it("Ctrl+S saves only the active pane", async () => {
    const view = render(<>
      <div data-testid="A"><MarkdownEditor pane="A" file={file} /></div>
      <div data-testid="B"><MarkdownEditor pane="B" file={file} /></div>
    </>);
    await waitFor(() => expect(view.getAllByRole("textbox")).toHaveLength(2));
    fireEvent.change(within(view.getByTestId("A")).getByRole("textbox"), { target: { value: "draft A" } });
    fireEvent.change(within(view.getByTestId("B")).getByRole("textbox"), { target: { value: "draft B" } });
    useLayoutStore.setState({ activePane: "B" });
    await act(async () => { fireEvent.keyDown(window, { key: "s", ctrlKey: true }); });
    expect(mocks.mutateNote).toHaveBeenCalledExactlyOnceWith(file.fileId, { content: "draft B" });
    expect(Object.entries(useSaveIndicatorStore.getState().files).find(([key]) => !key.endsWith(":B"))?.[1].state).toBe("dirty");
  });

  it("Ctrl+S handled by the focused B surface does not also save the stale active pane A", async () => {
    const save = deferredSave();
    mocks.mutateNote.mockReturnValue(save.promise);
    const view = render(<>
      <div data-testid="A"><MarkdownEditor pane="A" file={file} /></div>
      <div data-testid="B"><MarkdownEditor pane="B" file={file} /></div>
    </>);
    await waitFor(() => expect(view.getAllByRole("textbox")).toHaveLength(2));
    const surfaceA = within(view.getByTestId("A")).getByRole("textbox");
    const surfaceB = within(view.getByTestId("B")).getByRole("textbox");
    fireEvent.change(surfaceA, { target: { value: "draft A" } });
    fireEvent.change(surfaceB, { target: { value: "draft B" } });

    // keyboard focus does not trigger the pane's pointer-based activation
    act(() => { surfaceB.focus(); });
    expect(document.activeElement).toBe(surfaceB);
    expect(useLayoutStore.getState().activePane).toBe("A");
    await act(async () => {
      expect(fireEvent.keyDown(surfaceB, { key: "s", ctrlKey: true })).toBe(false);
    });

    expect(mocks.mutateNote).toHaveBeenCalledExactlyOnceWith(file.fileId, { content: "draft B" });
    expect(Object.entries(useSaveIndicatorStore.getState().files).find(([key]) => !key.endsWith(":B"))?.[1].state).toBe("dirty");
  });

  it.each([false, true])(
    "reopening a closed B note in A restores its draft with duplicate note=%s",
    async (sameNote) => {
      const otherFile = { ...file, fileId: "other-note" };
      useLayoutStore.getState().setPaneA(sameNote ? file : otherFile);
      useLayoutStore.getState().setPaneB(file);
      function Workspace() {
        const paneA = useLayoutStore((state) => state.paneA);
        const paneB = useLayoutStore((state) => state.paneB);
        return <>
          <div data-testid="A"><MarkdownEditor key={paneA.fileId} pane="A" file={paneA} /></div>
          <div data-testid="B">{paneB && <MarkdownEditor key={paneB.fileId} pane="B" file={paneB} />}</div>
        </>;
      }
      const view = render(<Workspace />);
      await waitFor(() => expect(view.getAllByRole("textbox")).toHaveLength(2));
      fireEvent.change(within(view.getByTestId("B")).getByRole("textbox"), {
        target: { value: "unsaved closed B" },
      });

      act(() => { useLayoutStore.getState().setPaneB(undefined); });
      expect(within(view.getByTestId("B")).queryByRole("textbox")).toBeNull();
      expect((await readDraft(file.fileId, "B"))?.content).toBe("unsaved closed B");
      expect(await readDraft(file.fileId, "A")).toBeNull();
      expect(mocks.mutateNote).not.toHaveBeenCalled();

      if (sameNote) {
        act(() => { useLayoutStore.getState().setPaneA(otherFile); });
        await waitFor(() => expect(within(view.getByTestId("A")).getByRole("textbox")).toBeTruthy());
      }
      act(() => { useLayoutStore.getState().setPaneA(file); });

      await waitFor(() => {
        expect((within(view.getByTestId("A")).getByRole("textbox") as HTMLTextAreaElement).value)
          .toBe("unsaved closed B");
      });
      expect(Object.entries(useSaveIndicatorStore.getState().files).find(([key]) => !key.endsWith(":B"))?.[1].state).toBe("dirty");
    },
  );

  it.each([true, false])("drafts follow swapped panes with same note=%s", async (sameNote) => {
    useLayoutStore.setState({
      paneA: file,
      paneB: { ...file, fileId: sameNote ? file.fileId : "second-note" },
    });
    function Workspace() {
      const paneA = useLayoutStore((state) => state.paneA);
      const paneB = useLayoutStore((state) => state.paneB);
      return <>
        <div data-testid="A"><MarkdownEditor key={paneA.fileId} pane="A" file={paneA} /></div>
        <div data-testid="B">{paneB && <MarkdownEditor key={paneB.fileId} pane="B" file={paneB} />}</div>
      </>;
    }
    const view = render(<Workspace />);
    await waitFor(() => expect(view.getAllByRole("textbox")).toHaveLength(2));
    fireEvent.change(within(view.getByTestId("A")).getByRole("textbox"), { target: { value: "unsaved A" } });
    fireEvent.change(within(view.getByTestId("B")).getByRole("textbox"), { target: { value: "unsaved B" } });

    act(() => { useLayoutStore.getState().swapPanes(); });
    await waitFor(() => {
      expect((within(view.getByTestId("A")).getByRole("textbox") as HTMLTextAreaElement).value).toBe("unsaved B");
      expect((within(view.getByTestId("B")).getByRole("textbox") as HTMLTextAreaElement).value).toBe("unsaved A");
    });
    await savePane("A");
    expect(await readDraft(sameNote ? file.fileId : "second-note", "B")).toBeNull();
    expect((await readDraft(file.fileId, "A"))?.content).toBe("unsaved A");
  });
});
