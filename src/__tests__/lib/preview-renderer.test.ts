import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PreviewRenderer from "@/components/editor/preview-renderer";

function renderPreview(content: string, noteId?: string) {
  return renderToStaticMarkup(
    React.createElement(PreviewRenderer, { content, noteId }),
  );
}

const contractFixture = fs.readFileSync(
  path.join(process.cwd(), "src/__tests__/fixtures/markdown-contract.md"),
  "utf8",
);

describe("PreviewRenderer", () => {
  it("renders the markdown contract fixture across core syntax", () => {
    const html = renderPreview(contractFixture, "note-contract");

    expect(html).toContain("<h1");
    expect(html).toContain("Markdown Contract Fixture");
    expect(html).toContain("<strong");
    expect(html).toContain("bold");
    expect(html).toContain("<em");
    expect(html).toContain("italic");
    expect(html).toContain("<del>strike</del>");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("inlineCode()");
    expect(html).toContain("contract-fixture.ts");
    expect(html).toContain("hljs-keyword");
    expect(html).toContain("unknown language fallback");
    expect(html).toContain("contains-task-list");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("<blockquote");
    expect(html).toContain("<table");
    expect(html).toContain("katex");
    expect(html).toContain(
      'src="/api/notes/note-contract/assets?name=_page_1_Figure_2.png"',
    );
    expect(html).toContain("<mark>Safe highlight</mark>");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("onerror=");
    expect(html).not.toContain('href="javascript:');
  });

  it("preserves syntax token classes for highlighted code", () => {
    const html = renderPreview("```javascript\nconst value = 1\n```");

    expect(html).toContain("hljs-keyword");
  });

  it("renders fenced code without language as a premium block with CODE fallback", () => {
    const html = renderPreview("```\nconst value = 1\n```");

    expect(html).toContain("oghma-codeblock");
    expect(html).toContain(">CODE<");
    expect(html).not.toContain('class="rounded bg-surface');
  });

  it("renders code fence title metadata in the header", () => {
    const html = renderPreview('```ts title="utils/math.ts"\nexport const one = 1\n```');

    expect(html).toContain("utils/math.ts");
    expect(html).toContain("TypeScript");
    expect(html).toContain("hljs-keyword");
  });

  it("falls back safely for unknown code fence languages", () => {
    const html = renderPreview("```definitely-not-a-language\nraw text\n```");

    expect(html).toContain("oghma-codeblock");
    expect(html).toContain(">CODE<");
    expect(html).toContain("raw text");
  });

  it("keeps list styling for task lists", () => {
    const html = renderPreview("- [x] done\n- [ ] todo");

    expect(html).toContain("contains-task-list");
    expect(html).toContain("list-disc");
  });

  it("allows safe inline html used in syntax guide", () => {
    const html = renderPreview("<mark>highlighted</mark>");

    expect(html).toContain("<mark>highlighted</mark>");
  });

  it("strips unsafe html and javascript links", () => {
    const html = renderPreview(
      '[x](javascript:alert(1))\n\n<script>alert(1)</script><img src="x" onerror="alert(1)" />',
    );

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("onerror=");
    expect(html).not.toContain('href="javascript:');
  });

  it("keeps syntax highlighting while sanitizing code fence contents", () => {
    const html = renderPreview("```html\n<script>alert(1)</script>\n```");

    expect(html).toContain("hljs");
    expect(html).not.toContain("<script>");
  });

  it("renders inline and display math with katex markup", () => {
    const html = renderPreview("Inline $x^2$ and display $$x^2$$.");

    expect(html).toContain("katex");
    expect(html).not.toContain("$x^2$");
    expect(html).not.toContain("$$x^2$$");
  });
});
