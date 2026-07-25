// @vitest-environment jsdom

import { fireEvent } from "@testing-library/dom";
import DOMPurify from "dompurify";
import { describe, expect, it, vi } from "vitest";
import {
  createSafeHtmlPreview,
  enhanceMilkdownCodeBlocks,
  getMermaidSourceFromExpandTarget,
  nextMermaidPanPosition,
  shouldApplyExternalMarkdown,
  updateMermaidPreviewZoom,
} from "@/components/editor/milkdown-write-editor";

describe("Milkdown value synchronization", () => {
  it("does not replace the document when a normalized list value echoes through React", () => {
    const emitted = "- first\n- second";

    expect(shouldApplyExternalMarkdown(emitted, emitted)).toBe(false);
    expect(
      shouldApplyExternalMarkdown("- first\n- second\n- third", emitted),
    ).toBe(true);
  });
});

describe("Milkdown spike code controls", () => {
  it("retains a Mermaid preview ID after Milkdown reserializes the preview DOM", () => {
    const source = 'flowchart LR\nA["Quoted label"] --> B';
    const stage = document.createElement("div");
    stage.id = "oghma-mermaid-preview-test";
    stage.className = "oghma-mermaid-stage";
    stage.innerHTML =
      '<button type="button" class="oghma-mermaid-expand-button"><svg><path /></svg></button>';

    document.body.innerHTML = DOMPurify.sanitize(stage, {
      ADD_TAGS: ["foreignObject"],
      ADD_ATTR: ["xmlns"],
      HTML_INTEGRATION_POINTS: { foreignobject: true },
    });
    const icon = document.querySelector("path");

    expect(
      getMermaidSourceFromExpandTarget(
        icon,
        new Map([["oghma-mermaid-preview-test", source]]),
      ),
    ).toBe(source);
  });

  it("zooms a Mermaid preview relative to its intrinsic width", () => {
    document.body.innerHTML = `
      <div class="oghma-mermaid-stage" data-mermaid-zoom="100">
        <div class="oghma-mermaid-diagram" style="--oghma-mermaid-intrinsic-width: 800px"></div>
        <div class="oghma-mermaid-inline-controls">
          <button data-oghma-mermaid-action="zoom-out"></button>
          <button class="oghma-mermaid-inline-reset" data-oghma-mermaid-action="reset">100%</button>
          <button data-oghma-mermaid-action="zoom-in"><svg><path /></svg></button>
        </div>
      </div>`;
    const stage = document.querySelector<HTMLElement>(".oghma-mermaid-stage")!;
    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({
      bottom: 640,
      height: 600,
      left: 0,
      right: 800,
      top: 40,
      width: 800,
      x: 0,
      y: 40,
      toJSON: () => ({}),
    });

    expect(updateMermaidPreviewZoom(document.querySelector("path"))).toBe(true);
    const diagram = document.querySelector<HTMLElement>(
      ".oghma-mermaid-diagram",
    )!;
    expect(stage.dataset.mermaidZoom).toBe("125");
    expect(stage.dataset.mermaidZoomed).toBe("true");
    expect(stage.dataset.mermaidPannable).toBe("true");
    expect(
      stage.style.getPropertyValue(
        "--oghma-mermaid-inline-viewport-height",
      ),
    ).toBe("600px");
    expect(
      diagram.style.getPropertyValue("--oghma-mermaid-inline-width"),
    ).toBe("1000px");
    expect(
      diagram.style.getPropertyValue("--oghma-mermaid-inline-percent"),
    ).toBe("125%");
    expect(document.querySelector(".oghma-mermaid-inline-reset")?.textContent).toBe(
      "125%",
    );

    expect(
      updateMermaidPreviewZoom(
        document.querySelector(".oghma-mermaid-inline-reset"),
      ),
    ).toBe(true);
    expect(stage.dataset.mermaidZoom).toBe("100");
    expect(
      stage.style.getPropertyValue(
        "--oghma-mermaid-inline-viewport-height",
      ),
    ).toBe("");
  });

  it("anchors Mermaid controls in the code-block toolbar", () => {
    const source = "flowchart LR\nA-->B";
    document.body.innerHTML = `
      <div id="root">
        <div class="milkdown-code-block">
          <div class="tools">
            <button class="language-button">mermaid</button>
            <div class="tools-button-group">
              <button>Copy</button>
              <button class="preview-toggle-button"><svg></svg>Edit</button>
            </div>
          </div>
          <div class="codemirror-host"></div>
          <div class="preview-panel">
            <div class="preview">
              <div id="oghma-mermaid-preview-toolbar" class="oghma-mermaid-stage">
                <div class="oghma-mermaid-diagram" style="--oghma-mermaid-intrinsic-width: 800px"></div>
              </div>
            </div>
          </div>
        </div>
      </div>`;
    const root = document.querySelector<HTMLElement>("#root")!;

    enhanceMilkdownCodeBlocks(root);
    enhanceMilkdownCodeBlocks(root);

    const toolbar = root.querySelector(".tools-button-group")!;
    const expand = toolbar.querySelector<HTMLButtonElement>(
      '[data-oghma-mermaid-action="expand"]',
    )!;
    const zoomIn = toolbar.querySelector<HTMLButtonElement>(
      '[data-oghma-mermaid-action="zoom-in"]',
    )!;
    const zoomOut = toolbar.querySelector<HTMLButtonElement>(
      '[data-oghma-mermaid-action="zoom-out"]',
    )!;
    expect(toolbar.querySelectorAll("[data-oghma-mermaid-action]")).toHaveLength(
      4,
    );
    expect(
      toolbar.querySelector(".oghma-mermaid-zoom-group")?.children,
    ).toHaveLength(3);
    expect(toolbar.querySelector(".oghma-code-copy")).not.toBeNull();
    expect(expand.dataset.oghmaMermaidPreviewId).toBe(
      "oghma-mermaid-preview-toolbar",
    );
    expect(
      getMermaidSourceFromExpandTarget(
        expand,
        new Map([["oghma-mermaid-preview-toolbar", source]]),
      ),
    ).toBe(source);
    expect(updateMermaidPreviewZoom(zoomIn)).toBe(true);
    expect(
      document
        .querySelector<HTMLElement>(".oghma-mermaid-stage")
        ?.dataset.mermaidZoom,
    ).toBe("125");
    expect(
      toolbar.querySelector(".oghma-mermaid-inline-reset")?.textContent,
    ).toBe("125%");

    updateMermaidPreviewZoom(zoomIn);
    updateMermaidPreviewZoom(zoomIn);
    updateMermaidPreviewZoom(zoomIn);
    expect(zoomIn.disabled).toBe(true);
    expect(
      toolbar.querySelector(".oghma-mermaid-inline-reset")?.textContent,
    ).toBe("200%");

    expect(
      updateMermaidPreviewZoom(
        toolbar.querySelector(".oghma-mermaid-inline-reset"),
      ),
    ).toBe(true);
    expect(zoomIn.disabled).toBe(false);
    expect(
      toolbar.querySelector(".oghma-mermaid-inline-reset")?.textContent,
    ).toBe("100%");
    updateMermaidPreviewZoom(zoomOut);
    updateMermaidPreviewZoom(zoomOut);
    expect(zoomOut.disabled).toBe(true);
    expect(
      toolbar.querySelector(".oghma-mermaid-inline-reset")?.textContent,
    ).toBe("50%");
    expect(
      root.querySelector(".preview-toggle-button")?.getAttribute("aria-label"),
    ).toBe("Edit diagram source");
    expect(
      root.querySelector(".oghma-code-copy")?.getAttribute("aria-label"),
    ).toBe("Copy Mermaid source");
  });

  it("turns pointer movement into grab-to-pan scroll offsets", () => {
    expect(nextMermaidPanPosition(300, 40, 500, 200, 425, 170)).toEqual({
      left: 375,
      top: 70,
    });
  });

  it("adds accessible wrap and copy controls without touching code text", () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div id="root">
        <div class="milkdown-code-block">
          <div class="tools">
            <button class="language-button">ts<span class="expand-icon"></span></button>
            <div class="tools-button-group"><button>Copy</button><button class="preview-toggle-button"><svg></svg>Hide</button></div>
          </div>
          <div class="codemirror-host"><div class="cm-scroller"><div class="cm-content"><div class="cm-line">const answer = 42;</div><div class="cm-line">export {};</div></div></div></div>
        </div>
      </div>`;
    const root = document.querySelector<HTMLElement>("#root")!;

    enhanceMilkdownCodeBlocks(root);

    const language = root.querySelector<HTMLButtonElement>(".language-button")!;
    const wrap = root.querySelector<HTMLButtonElement>(".oghma-code-wrap")!;
    const copy = root.querySelectorAll<HTMLButtonElement>(".tools-button-group button")[1];
    const preview = root.querySelector<HTMLButtonElement>(".preview-toggle-button")!;
    expect(language.getAttribute("aria-label")).toContain("TypeScript");
    expect(language.childNodes[0]?.textContent).toBe("ts");
    expect(wrap.getAttribute("aria-pressed")).toBe("false");
    expect(copy.getAttribute("aria-label")).toBe("Copy code");
    expect(copy.textContent).toBe("");
    expect(preview.textContent).toBe("");
    expect(preview.getAttribute("aria-label")).toBe("Hide diagram preview");
    expect(root.querySelector<HTMLElement>(".codemirror-host")?.style.getPropertyValue("--oghma-code-host-min-height")).toBe("4rem");

    fireEvent.click(wrap);
    expect(wrap.getAttribute("aria-pressed")).toBe("true");
    expect(root.querySelector(".cm-content")?.classList).toContain("cm-lineWrapping");
    expect(root.querySelector(".cm-content")?.textContent).toBe("const answer = 42;export {};");

    fireEvent.click(copy);
    expect(copy.getAttribute("aria-label")).toBe("Code copied");
    vi.runAllTimers();
    expect(copy.getAttribute("aria-label")).toBe("Copy code");
    vi.useRealTimers();
  });

  it("is idempotent when the observer sees the same block repeatedly", () => {
    document.body.innerHTML = `<div id="root"><div class="milkdown-code-block"><button class="language-button">diff</button><div class="tools-button-group"><button>Copy</button></div></div></div>`;
    const root = document.querySelector<HTMLElement>("#root")!;
    enhanceMilkdownCodeBlocks(root);
    enhanceMilkdownCodeBlocks(root);
    expect(root.querySelectorAll(".oghma-code-wrap")).toHaveLength(1);
  });
});

describe("Milkdown HTML previews", () => {
  it("renders complete safe HTML while preserving its Markdown source", () => {
    const preview = createSafeHtmlPreview("<mark>important</mark>");

    expect(preview).not.toBeNull();
    expect(preview?.innerHTML).toBe("<mark>important</mark>");
    expect(preview?.dataset.rawHtml).toBe("<mark>important</mark>");
  });

  it("rejects incomplete HTML and strips unsafe content", () => {
    expect(createSafeHtmlPreview("<mark>incomplete")).toBeNull();

    const preview = createSafeHtmlPreview(
      '<mark onclick="alert(1)">safe</mark>',
    );
    expect(preview?.innerHTML).toBe("<mark>safe</mark>");
  });
});

describe("Milkdown raw HTML preview", () => {
  it("renders complete safe HTML blocks and preserves their source", () => {
    const source =
      '<table><tbody><tr><td colspan="2">Cell</td></tr></tbody></table>';
    const preview = createSafeHtmlPreview(source);

    expect(preview?.querySelector("table")).not.toBeNull();
    expect(preview?.querySelector("td")?.getAttribute("colspan")).toBe("2");
    expect(preview?.dataset.rawHtml).toBe(source);
  });

  it("removes executable HTML from rendered blocks", () => {
    const preview = createSafeHtmlPreview(
      '<details open><summary>Safe</summary><img src="x" onerror="alert(1)"><script>alert(1)</script></details>',
    );

    expect(preview?.querySelector("details")).not.toBeNull();
    expect(preview?.querySelector("script")).toBeNull();
    expect(preview?.innerHTML).not.toContain("onerror");
  });

  it("leaves individual HTML tokens to inline decorations", () => {
    expect(createSafeHtmlPreview("<mark>")).toBeNull();
    expect(createSafeHtmlPreview("</mark>")).toBeNull();
  });
});
