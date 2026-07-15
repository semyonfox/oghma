// @vitest-environment jsdom

import { fireEvent } from "@testing-library/dom";
import { describe, expect, it, vi } from "vitest";
import { enhanceMilkdownCodeBlocks } from "@/components/editor/milkdown-write-editor";

describe("Milkdown spike code controls", () => {
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
