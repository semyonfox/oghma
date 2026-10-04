import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { withI18n } from "@/__tests__/test-utils/i18n";
import PreviewRenderer from "@/components/editor/preview-renderer";

function renderPreview(content: string, noteId?: string) {
  return renderToStaticMarkup(
    withI18n(React.createElement(PreviewRenderer, { content, noteId })),
  );
}

const contractFixture = fs.readFileSync(
  path.join(process.cwd(), "src/__tests__/fixtures/markdown-contract.md"),
  "utf8",
);

describe("PreviewRenderer Markdown contract", () => {
  it("renders the compatibility fixture through the safe note pipeline", () => {
    const html = renderPreview(contractFixture, "note-contract");

    expect(html).toContain("Markdown Contract Fixture");
    expect(html).toContain("<strong");
    expect(html).toContain(">bold</strong>");
    expect(html).toContain("<del>strike</del>");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain("contract-fixture.ts");
    expect(html).toContain("inlineCode()");
    expect(html).toContain("katex");
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
});

describe("PreviewRenderer attachment images", () => {
  it("resolves Marker image names through the owning note", () => {
    const html = renderPreview(
      "![Figure](_page_12_Figure_3.png)",
      "01963b3a-7c50-7000-8000-000000000001",
    );

    expect(html).toContain(
      'src="/api/notes/01963b3a-7c50-7000-8000-000000000001/assets?name=_page_12_Figure_3.png"',
    );
    expect(html).toContain('alt="Figure"');
    expect(html).toContain('loading="lazy"');
  });

  it.each([
    ["an absolute URL", "https://example.com/figure.png"],
    ["an application path", "/uploads/figure.png"],
    ["an unrelated relative image", "diagram.png"],
  ])("leaves %s unchanged", (_label, source) => {
    expect(renderPreview(`![Figure](${source})`, "note-1")).toContain(
      `src="${source}"`,
    );
  });

  it("does not invent an asset route when the note ID is unavailable", () => {
    expect(renderPreview("![](_page_1_Picture_2.webp)")).toContain(
      'src="_page_1_Picture_2.webp"',
    );
  });

  it("renders the translated empty-state copy", () => {
    const html = renderPreview("");

    expect(html).toContain("<em");
    expect(html).toContain(">No content</em>");
  });
});
