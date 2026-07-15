import { describe, expect, it } from "vitest";
import {
  CODE_BLOCK_LANGUAGES,
  htmlTableRanges,
  inlineMathRangesForLine,
  markdownCodeFenceAt,
  markdownCodeFenceRanges,
  markdownTaskMarkerForLine,
  markdownSyntaxRangesForLine,
  markdownTableRanges,
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

  it("treats the whole fenced code cell as active source", () => {
    const ranges = markdownCodeFenceRanges("Before\n```ts\nconst value = 1\n```\nAfter");

    expect(markdownCodeFenceAt(ranges, 20)).toBe(ranges[0]);
    expect(markdownCodeFenceAt(ranges, 3)).toBeUndefined();
  });

  it("finds GFM table blocks without changing their markdown", () => {
    const markdown = "Before\n| Topic | Score |\n| :--- | ---: |\n| Math | **95** |\nAfter";

    expect(markdownTableRanges(markdown)).toEqual([
      {
        from: 7,
        to: 58,
        source: "| Topic | Score |\n| :--- | ---: |\n| Math | **95** |",
        header: ["Topic", "Score"],
        rows: [["Math", "**95**"]],
        alignments: ["left", "right"],
      },
    ]);
    expect(markdown.slice(7, 58)).toBe(
      "| Topic | Score |\n| :--- | ---: |\n| Math | **95** |",
    );
  });

  it("finds safe HTML table blocks without executing their contents", () => {
    const markdown =
      'Before\n<table><tr><th>Topic</th><th>Score</th></tr><tr><td>Math</td><td><strong>95</strong></td></tr></table>\nAfter';

    expect(htmlTableRanges(markdown)).toEqual([
      {
        from: 7,
        to: 109,
        source:
          "<table><tr><th>Topic</th><th>Score</th></tr><tr><td>Math</td><td><strong>95</strong></td></tr></table>",
        header: ["Topic", "Score"],
        rows: [["Math", "95"]],
        alignments: [undefined, undefined],
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

  it("hides emphasis and strike markers while their line is inactive", () => {
    expect(
      markdownSyntaxRangesForLine("read _this_, *that*, and ~~gone~~", 0, false),
    ).toEqual([
      { from: 5, to: 6 },
      { from: 10, to: 11 },
      { from: 13, to: 14 },
      { from: 18, to: 19 },
      { from: 25, to: 27 },
      { from: 31, to: 33 },
    ]);
    expect(markdownSyntaxRangesForLine("snake_case_value", 0, false)).toEqual([]);
  });

  it("hides all combined bold and italic markers on inactive lines", () => {
    expect(markdownSyntaxRangesForLine("***both*** and ___also___", 0, false)).toEqual([
      { from: 0, to: 3 },
      { from: 7, to: 10 },
      { from: 15, to: 18 },
      { from: 22, to: 25 },
    ]);
  });

  it("renders safe inline HTML only while its line is inactive", () => {
    expect(markdownSyntaxRangesForLine("Press <kbd>Ctrl</kbd>", 0, false)).toContainEqual({
      from: 6,
      to: 21,
      inlineHtml: { tag: "kbd", text: "Ctrl" },
    });
    expect(markdownSyntaxRangesForLine("Press <kbd>Ctrl</kbd>", 0, true)).toEqual([]);
  });

  it("renders standard horizontal rules while inactive and keeps source active", () => {
    for (const rule of ["---", "***", "___"]) {
      expect(markdownSyntaxRangesForLine(rule, 10, false)).toEqual([
        { from: 10, to: 13, horizontalRule: true },
      ]);
      expect(markdownSyntaxRangesForLine(rule, 10, true)).toEqual([]);
    }
    expect(markdownSyntaxRangesForLine("===", 10, false)).toEqual([]);
  });

  it("reveals escaped Markdown literally while inactive", () => {
    expect(markdownSyntaxRangesForLine(String.raw`\*Not italic\*`, 0, false)).toEqual([
      { from: 0, to: 1 },
      { from: 12, to: 13 },
    ]);
  });

  it("renders basic images while inactive and restores source on their line", () => {
    expect(
      markdownSyntaxRangesForLine(
        '![Markdown](https://example.com/logo.png "Logo")',
        0,
        false,
      ),
    ).toContainEqual({
      from: 0,
      to: 48,
      image: {
        alt: "Markdown",
        src: "https://example.com/logo.png",
        title: "Logo",
      },
    });
  });

  it("hides every nested blockquote marker while inactive", () => {
    expect(markdownSyntaxRangesForLine("> > nested", 10, false)).toEqual([
      { from: 10, to: 14 },
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
