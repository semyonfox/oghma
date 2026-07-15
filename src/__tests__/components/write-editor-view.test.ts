// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import {
  markdownDisplayMathDecorations,
  markdownRenderDecorations,
  markdownTableDecorations,
} from "@/components/editor/write-editor";

describe("WriteEditor table decorations", () => {
  it("mounts tables through a state field without a block-plugin layout error", () => {
    const doc = "| Topic | Score |\n| --- | ---: |\n| Math | 95 |\n\nAfter";
    const parent = document.createElement("div");
    document.body.append(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc,
        selection: { anchor: doc.length },
        extensions: [markdownTableDecorations],
      }),
    });

    const renderedTable = parent.querySelector("table.cm-md-table");
    expect(renderedTable).not.toBeNull();
    expect(parent.textContent).toContain("After");

    renderedTable?.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, clientX: 1, clientY: 1 }),
    );
    expect(view.state.selection.main.head).toBe(0);
    expect(parent.querySelector("table.cm-md-table")).toBeNull();
    expect(parent.textContent).toContain("| Topic | Score |");

    view.destroy();
    parent.remove();
  });
});

describe("WriteEditor display math decorations", () => {
  it("mounts block math through a state field without truncating later content", () => {
    const doc = [
      "## Math (LaTeX)",
      "",
      "$$",
      "\\begin{aligned}",
      "y &= (x+1)^2 \\\\",
      "  &= x^2 + 2x + 1",
      "\\end{aligned}",
      "$$",
      "",
      "## Code",
      "Content after the equation",
    ].join("\n");
    const parent = document.createElement("div");
    document.body.append(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc,
        selection: { anchor: doc.length },
        extensions: [markdownDisplayMathDecorations],
      }),
    });

    expect(parent.querySelector(".cm-math-display")).not.toBeNull();
    expect(parent.textContent).toContain("Content after the equation");

    view.destroy();
    parent.remove();
  });
});

describe("WriteEditor raw HTML decorations", () => {
  it("keeps content after an HTML table and a general HTML block", () => {
    const doc = [
      "## Complex Table (with HTML)",
      "",
      "<table>",
      "  <tr><th colspan=\"2\">Merged Header</th><th>Normal Header</th></tr>",
      "  <tr><td>Cell A</td><td>Cell B</td><td rowspan=\"2\">Merged Vertical</td></tr>",
      "  <tr><td>Cell C</td><td>Cell D</td></tr>",
      "</table>",
      "",
      "## HTML in Markdown",
      "",
      "<div style=\"background-color: #f0f0f0; padding: 10px\">",
      "  <p>This is HTML inside Markdown.</p>",
      "  <ul><li>HTML list item</li><li>Another item</li></ul>",
      "</div>",
      "",
      "## Conclusion",
      "Content after all injected HTML",
    ].join("\n");
    const parent = document.createElement("div");
    document.body.append(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc,
        selection: { anchor: doc.length },
        extensions: [
          markdownTableDecorations,
          markdownDisplayMathDecorations,
          markdownRenderDecorations,
        ],
      }),
    });

    expect(parent.querySelector("table.cm-md-table")).not.toBeNull();
    expect(parent.textContent).toContain("This is HTML inside Markdown.");
    expect(parent.textContent).toContain("Content after all injected HTML");

    view.destroy();
    parent.remove();
  });
});
