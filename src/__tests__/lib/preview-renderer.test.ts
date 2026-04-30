import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PreviewRenderer from "@/components/editor/preview-renderer";

function renderPreview(content: string) {
  return renderToStaticMarkup(
    React.createElement(PreviewRenderer, { content }),
  );
}

describe("PreviewRenderer", () => {
  it("preserves syntax token classes for highlighted code", () => {
    const html = renderPreview("```javascript\nconst value = 1\n```");

    expect(html).toContain("hljs-keyword");
  });

  it("renders fenced code without language as a block", () => {
    const html = renderPreview("```\nconst value = 1\n```");

    // CodeBlock wraps the pre; verify a <pre> element is present (block render)
    expect(html).toContain("<pre");
    expect(html).not.toContain('class="rounded bg-surface');
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
