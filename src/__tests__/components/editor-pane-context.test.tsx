// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/lib/notes/hooks/use-i18n", () => ({ default: () => ({ t: (key: string) => key }) }));
vi.mock("@/lib/hooks/use-media-query", () => ({ default: () => true }));
vi.mock("react-resizable-panels", () => ({ Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, Separator: () => null }));
import SplitEditorPane from "@/components/editor/split-editor-pane";
import EditorPane from "@/components/editor/editor-pane";
import useLayoutStore from "@/lib/notes/state/layout.zustand";
import useSaveIndicatorStore from "@/lib/notes/state/save-indicator";
const a = { fileId: "note-a", fileType: "note" as const, title: "Lecture A" };
const b = { fileId: "note-b", fileType: "note" as const, title: "Lecture B" };
afterEach(cleanup);
beforeEach(() => useLayoutStore.setState({ paneA: a, paneB: b, activePane: "A", rightPanelOpen: true, rightPanelTab: "meta" }));
describe("editor pane context", () => {
  it("switches inspector context without closing the open tab", () => {
    render(<EditorPane pane="B" file={b} />);
    const toggle = screen.getByRole("button", { name: "Toggle metadata panel" });
    fireEvent.mouseDown(toggle);
    fireEvent.focus(toggle);
    fireEvent.click(toggle);
    expect(useLayoutStore.getState().activePane).toBe("B");
    expect(useLayoutStore.getState().rightPanelOpen).toBe(true);
    fireEvent.click(toggle);
    expect(useLayoutStore.getState().rightPanelOpen).toBe(false);
  });
  it("returns context and focus to A after closing B", () => {
    render(<SplitEditorPane />);
    fireEvent.click(screen.getByRole("button", { name: "Close this pane" }));
    expect(useLayoutStore.getState().activePane).toBe("A");
    expect(useLayoutStore.getState().paneB).toBeNull();
    expect(document.activeElement?.getAttribute("data-editor-pane")).toBe("A");
  });
  it("keeps the save announcement mounted and exposes an actionable retry", () => {
    const save = vi.fn();
    useSaveIndicatorStore.setState({ files: { [a.fileId]: { state: "dirty", save } } });
    render(<EditorPane pane="A" file={a} />);
    const status = screen.getByRole("status");
    act(() => useSaveIndicatorStore.getState().setIndicator(a.fileId, { state: "saving", save }));
    expect(status.textContent).toBe("Saving...");
    act(() => useSaveIndicatorStore.getState().setIndicator(a.fileId, { state: "saved", save }));
    expect(screen.getByRole("status")).toBe(status);
    expect(status.textContent).toBe("Saved");
    act(() => useSaveIndicatorStore.getState().setIndicator(a.fileId, { state: "error", save }));
    expect(status.textContent).toBe("Save failed");
    const retry = screen.getAllByRole("button", { name: "Retry save" })[0];
    retry.focus();
    save.mockImplementation(() => useSaveIndicatorStore.getState().setIndicator(a.fileId, { state: "saving", save }));
    fireEvent.click(retry);
    expect(save).toHaveBeenCalledOnce();
    expect(document.activeElement?.getAttribute("data-editor-pane")).toBe("A");
    expect(screen.queryByRole("button", { name: "Retry save" })).toBeNull();
  });

});
