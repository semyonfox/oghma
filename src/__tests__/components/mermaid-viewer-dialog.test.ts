// @vitest-environment jsdom

import { createElement, Fragment, useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MermaidViewerDialog, {
  MERMAID_FIT_ZOOM,
  nextMermaidZoom,
} from "@/lib/markdown/components/mermaid-viewer-dialog";

const { renderMermaidElement } = vi.hoisted(() => ({
  renderMermaidElement: vi.fn(async () => {
    const diagram = document.createElement("div");
    diagram.className = "oghma-mermaid-diagram";
    diagram.innerHTML = "<svg><text>Readable</text></svg>";
    return diagram;
  }),
}));

vi.mock("@/lib/markdown/mermaid", () => ({
  renderMermaidElement,
}));

afterEach(cleanup);

function ViewerHarness() {
  const [open, setOpen] = useState(false);
  return createElement(
    Fragment,
    null,
    createElement(
      "button",
      { type: "button", onClick: () => setOpen(true) },
      "Open diagram",
    ),
    createElement(MermaidViewerDialog, {
      open,
      source: "flowchart LR\nA-->B",
      onClose: () => setOpen(false),
    }),
  );
}

describe("Mermaid viewer zoom", () => {
  it("moves in bounded 25% steps around the fit width", () => {
    expect(nextMermaidZoom(MERMAID_FIT_ZOOM, 1)).toBe(125);
    expect(nextMermaidZoom(MERMAID_FIT_ZOOM, -1)).toBe(75);
    expect(nextMermaidZoom(300, 1)).toBe(300);
    expect(nextMermaidZoom(75, -1)).toBe(75);
  });

  it("re-renders in a dialog and returns focus after Escape", async () => {
    render(createElement(ViewerHarness));
    const trigger = screen.getByRole("button", { name: "Open diagram" });
    fireEvent.click(trigger);

    expect(await screen.findByRole("dialog")).not.toBeNull();
    expect(renderMermaidElement).toHaveBeenCalledWith("flowchart LR\nA-->B");
    expect(await screen.findByText("Readable")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByText("125%")).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
