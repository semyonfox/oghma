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
      svg: '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><text>Safe</text></svg>',
    });

    const preview = await renderMermaidElement("flowchart LR\nA-->B");

    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({ securityLevel: "strict", startOnLoad: false, theme: "dark" }),
    );
    expect(preview.innerHTML).toContain("Safe");
    expect(preview.innerHTML).not.toContain("script");
    expect(preview.innerHTML).not.toContain("onload");
    expect(preview.getAttribute("role")).toBe("img");
  });
});
