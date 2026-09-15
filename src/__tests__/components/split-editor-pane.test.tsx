// @vitest-environment jsdom

import React from "react";
import type { FileSpec } from "@/lib/notes/state/layout.zustand";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isDesktop: true,
  setActivePane: vi.fn(),
}));

const layoutState = {
  paneA: { fileId: "a", fileType: "note" as const, title: "A" },
  paneB: { fileId: "b", fileType: "note" as const, title: "B" } as FileSpec | undefined,
  setActivePane: mocks.setActivePane,
};

vi.mock("@/lib/hooks/use-media-query", () => ({
  __esModule: true,
  default: () => mocks.isDesktop,
}));

vi.mock("@/lib/notes/state/layout.zustand", () => ({
  __esModule: true,
  default: (selector: (state: typeof layoutState) => unknown) =>
    selector(layoutState),
}));

vi.mock("react-resizable-panels", () => ({
  Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Separator: () => <div data-testid="separator" />,
}));

vi.mock("@/components/editor/editor-pane", () => ({
  __esModule: true,
  default: ({
    pane,
    splitInteractionsEnabled,
  }: {
    pane: "A" | "B";
    splitInteractionsEnabled?: boolean;
  }) => (
    <div
      data-testid={`pane-${pane}`}
      data-split-interactions={String(splitInteractionsEnabled ?? true)}
    />
  ),
}));

import SplitEditorPane from "@/components/editor/split-editor-pane";

describe("SplitEditorPane responsive rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isDesktop = true;
    layoutState.paneB = { fileId: "b", fileType: "note", title: "B" };
  });

  it("renders both persisted panes on desktop", () => {
    render(<SplitEditorPane />);

    expect(screen.getByTestId("pane-A")).toBeTruthy();
    expect(screen.getByTestId("pane-B")).toBeTruthy();
    expect(screen.getByTestId("separator")).toBeTruthy();
  });

  it("mounts only pane A on mobile without clearing pane B", async () => {
    mocks.isDesktop = false;

    render(<SplitEditorPane />);

    expect(screen.getByTestId("pane-A")).toBeTruthy();
    expect(screen.queryByTestId("pane-B")).toBeNull();
    expect(screen.getByTestId("pane-A").dataset.splitInteractions).toBe("false");
    expect(layoutState.paneB?.fileId).toBe("b");
    await waitFor(() => expect(mocks.setActivePane).toHaveBeenCalledWith("A"));
  });

  it("preserves pane A and its scroll position when pane B closes and reopens", () => {
    const { rerender } = render(<SplitEditorPane />);
    const primary = screen.getByTestId("pane-A");
    primary.scrollTop = 640;

    layoutState.paneB = undefined;
    rerender(<SplitEditorPane />);
    expect(screen.getByTestId("pane-A")).toBe(primary);
    expect(primary.scrollTop).toBe(640);
    expect(screen.queryByTestId("pane-B")).toBeNull();

    layoutState.paneB = { fileId: "b", fileType: "note", title: "B" };
    rerender(<SplitEditorPane />);
    expect(screen.getByTestId("pane-A")).toBe(primary);
    expect(primary.scrollTop).toBe(640);
    expect(screen.getByTestId("pane-B")).toBeTruthy();
  });

});
