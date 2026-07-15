// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { markdownTableDecorations } from "@/components/editor/write-editor";

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

    expect(parent.querySelector("table.cm-md-table")).not.toBeNull();
    expect(parent.textContent).toContain("After");

    view.destroy();
    parent.remove();
  });
});
