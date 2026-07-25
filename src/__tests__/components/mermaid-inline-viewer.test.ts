// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MermaidInlineViewer, {
  clampMermaidTranslation,
  mermaidFitScale,
} from "@/lib/markdown/components/mermaid-inline-viewer";
import { renderMermaidElement } from "@/lib/markdown/mermaid";

vi.mock("@/lib/markdown/mermaid", () => ({
  renderMermaidElement: vi.fn(),
}));

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

describe("Mermaid inline viewer sizing", () => {
  beforeEach(() => {
    vi.mocked(renderMermaidElement).mockReset();
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  });

  it("fits wide diagrams without enlarging naturally small diagrams", () => {
    expect(mermaidFitScale(1200, 600)).toBe(0.5);
    expect(mermaidFitScale(300, 600)).toBe(1);
  });

  it("centres small content and clamps oversized content to the viewport", () => {
    expect(
      clampMermaidTranslation(
        { x: -100, y: -100 },
        { width: 600, height: 400 },
        { width: 300, height: 200 },
      ),
    ).toEqual({ x: 150, y: 100 });
    expect(
      clampMermaidTranslation(
        { x: -900, y: 50 },
        { width: 600, height: 400 },
        { width: 900, height: 600 },
      ),
    ).toEqual({ x: -316, y: 16 });
  });

  it("owns its controls and sends fullscreen through the supplied callback", async () => {
    const diagram = document.createElement("div");
    diagram.className = "oghma-mermaid-diagram";
    diagram.innerHTML =
      '<svg viewBox="0 0 800 400" aria-label="Rendered diagram"></svg>';
    vi.mocked(renderMermaidElement).mockResolvedValue(diagram);
    const onExpand = vi.fn();

    render(
      createElement(MermaidInlineViewer, {
        source: "flowchart LR\nA-->B",
        onExpand,
      }),
    );

    await waitFor(() => {
      expect(renderMermaidElement).toHaveBeenCalledWith("flowchart LR\nA-->B");
    });
    expect(
      screen.getByRole("button", { name: "Reset diagram zoom" }).textContent,
    ).toBe("100%");
    fireEvent.click(screen.getByRole("button", { name: "View diagram large" }));
    expect(onExpand).toHaveBeenCalledOnce();
  });
});
