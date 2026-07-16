// @vitest-environment jsdom

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isDesktop: true,
  setActivePane: vi.fn(),
}));

const layoutState = {
  paneA: { fileId: "a", fileType: "note" as const, title: "A" },
  paneB: { fileId: "b", fileType: "note" as const, title: "B" },
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
    expect(layoutState.paneB.fileId).toBe("b");
    await waitFor(() => expect(mocks.setActivePane).toHaveBeenCalledWith("A"));
  });
});
