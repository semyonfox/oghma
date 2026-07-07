import { describe, expect, it } from "vitest";
import {
  CODE_BLOCK_LANGUAGES,
  wrapMarkdownSelection,
} from "@/components/editor/write-editor";

describe("WriteEditor helpers", () => {
  it("keeps common study/code languages available for editable code blocks", () => {
    expect(CODE_BLOCK_LANGUAGES).toMatchObject({
      md: "Markdown",
      ts: "TypeScript",
      tsx: "TSX",
      bash: "Bash",
      sql: "SQL",
      python: "Python",
    });
  });

  it("wraps the current markdown selection and keeps the selection inside the markers", () => {
    expect(wrapMarkdownSelection("make this bold", 5, 9, "**")).toEqual({
      insert: "**this**",
      anchor: 7,
      head: 11,
    });
  });

  it("uses a fallback when applying markdown formatting with no selection", () => {
    expect(wrapMarkdownSelection("", 0, 0, "_", "_", "italic")).toEqual({
      insert: "_italic_",
      anchor: 1,
      head: 7,
    });
  });
});
