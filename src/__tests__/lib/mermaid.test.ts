// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const initialize = vi.fn();
const render = vi.fn();

vi.mock("mermaid", () => ({
  default: { initialize, render },
}));

import { renderMermaidElement } from "@/lib/markdown/mermaid";

describe("Mermaid rendering", () => {
  beforeEach(() => {
    initialize.mockClear();
    render.mockReset();
    document.documentElement.className = "dark";
  });

  it("uses strict mode and sanitizes the generated SVG", async () => {
    render.mockResolvedValue({
      svg: '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><span class="nodeLabel"><p>Readable label</p></span></div></foreignObject><text>Safe</text></svg>',
    });

    const preview = await renderMermaidElement("flowchart LR\nA-->B");

    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        securityLevel: "strict",
        startOnLoad: false,
        theme: "dark",
        htmlLabels: false,
        flowchart: { useMaxWidth: true },
      }),
    );
    expect(preview.innerHTML).toContain("Safe");
    expect(preview.textContent).toContain("Readable label");
    expect(preview.innerHTML).not.toContain("script");
    expect(preview.innerHTML).not.toContain("onload");
    expect(preview.getAttribute("role")).toBe("img");
    expect(preview.querySelector("text")?.style.getPropertyValue("fill")).toBe(
      "rgb(255, 255, 255)",
    );
    expect(
      preview.querySelector<HTMLElement>(".nodeLabel")?.style.getPropertyValue("color"),
    ).toBe("rgb(255, 255, 255)");
  });

  it("preserves the diagram's intrinsic width for responsive sizing", async () => {
    render.mockResolvedValue({
      svg: '<svg viewBox="0 0 208 65" width="100%" style="max-width: 208px"><text>A</text></svg>',
    });

    const preview = await renderMermaidElement("flowchart LR\nA-->B");

    expect(
      preview.style.getPropertyValue("--oghma-mermaid-intrinsic-width"),
    ).toBe("208px");
    expect(preview.querySelector("svg")?.style.maxWidth).toBe("208px");
  });
});
