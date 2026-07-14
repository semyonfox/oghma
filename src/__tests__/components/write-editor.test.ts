import { describe, expect, it } from "vitest";
import {
  CODE_BLOCK_LANGUAGES,
  inlineMathRangesForLine,
  markdownCodeFenceRanges,
  markdownTaskMarkerForLine,
  markdownSyntaxRangesForLine,
  toggleMarkdownTask,
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

  it("finds fenced code cells without changing their markdown", () => {
    const markdown = 'Before\n```python title="Example"\nprint("hi")\n```\nAfter';

    expect(markdownCodeFenceRanges(markdown)).toEqual([
      {
        from: 7,
        to: 48,
        openFrom: 7,
        openTo: 32,
        closeFrom: 45,
        closeTo: 48,
        language: "python",
        title: "Example",
      },
    ]);
    expect(markdown.slice(7, 48)).toBe(
      '```python title="Example"\nprint("hi")\n```',
    );
  });

  it("supports tilde and unfinished fenced code cells", () => {
    expect(markdownCodeFenceRanges("~~~sql\nselect 1")).toEqual([
      {
        from: 0,
        to: 15,
        openFrom: 0,
        openTo: 6,
        language: "sql",
        title: undefined,
      },
    ]);
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

  it("hides heading/list/task markdown syntax on inactive lines", () => {
    expect(markdownSyntaxRangesForLine("## Heading", 10, false)).toEqual([
      { from: 10, to: 13 },
    ]);
    expect(markdownSyntaxRangesForLine("- item", 20, false)).toEqual([
      { from: 20, to: 22, replaceWith: "•" },
    ]);
    expect(markdownSyntaxRangesForLine("- [ ] task", 30, false)).toEqual([
      {
        from: 30,
        to: 36,
        replaceWith: "",
        className: "cm-md-render-checkbox",
        taskMarker: {
          from: 30,
          to: 36,
          checkboxFrom: 33,
          checkboxTo: 34,
          checked: false,
        },
      },
    ]);
  });

  it("finds task checkbox ranges for indented unchecked and checked markdown tasks", () => {
    expect(markdownTaskMarkerForLine("  - [ ] task", 10)).toEqual({
      from: 12,
      to: 18,
      checkboxFrom: 15,
      checkboxTo: 16,
      checked: false,
    });

    expect(markdownTaskMarkerForLine("* [X] done", 20)).toEqual({
      from: 20,
      to: 26,
      checkboxFrom: 23,
      checkboxTo: 24,
      checked: true,
    });

    expect(markdownSyntaxRangesForLine("* [x] done", 20, false)).toEqual([
      {
        from: 20,
        to: 26,
        replaceWith: "✓",
        className: "cm-md-render-checkbox cm-md-render-checkbox-checked",
        taskMarker: {
          from: 20,
          to: 26,
          checkboxFrom: 23,
          checkboxTo: 24,
          checked: true,
        },
      },
    ]);
  });

  it("toggles only the canonical markdown task checkbox character", () => {
    expect(toggleMarkdownTask("- [ ] task", 3)).toBe("- [x] task");
    expect(toggleMarkdownTask("- [x] task", 3)).toBe("- [ ] task");
    expect(toggleMarkdownTask("- [X] task", 3)).toBe("- [ ] task");
    expect(toggleMarkdownTask("- [-] task", 3)).toBe("- [-] task");
  });

  it("keeps markdown syntax visible on the active line", () => {
    expect(markdownSyntaxRangesForLine("## Heading", 10, true)).toEqual([]);
  });

  it("hides paired inline markdown markers on inactive lines", () => {
    expect(markdownSyntaxRangesForLine("read **this** and `that`", 0, false)).toEqual([
      { from: 5, to: 7 },
      { from: 11, to: 13 },
      { from: 18, to: 19 },
      { from: 23, to: 24 },
    ]);
  });

  it("detects inactive inline math ranges without changing canonical markdown", () => {
    expect(inlineMathRangesForLine("Use $E=mc^2$ today", 100)).toEqual([
      { from: 104, to: 112, tex: "E=mc^2", displayMode: false },
    ]);
    expect(markdownSyntaxRangesForLine("Use $E=mc^2$ today", 100, false)).toEqual([
      { from: 104, to: 105 },
      { from: 111, to: 112 },
    ]);
  });

  it("does not treat escaped dollars, display delimiters, or code spans as inline math", () => {
    expect(inlineMathRangesForLine(String.raw`Cost \$5 and $$x$$`, 0)).toEqual([]);
    expect(inlineMathRangesForLine("Skip `$x$` but render $y$", 0)).toEqual([
      { from: 22, to: 25, tex: "y", displayMode: false },
    ]);
  });

  it("keeps math syntax visible on the active line", () => {
    expect(markdownSyntaxRangesForLine("Use $E=mc^2$ today", 100, true)).toEqual([]);
  });
});
