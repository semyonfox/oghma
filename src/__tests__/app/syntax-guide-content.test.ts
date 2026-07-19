import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SyntaxGuideContent from "@/app/syntax-guide/syntax-guide-content";

describe("SyntaxGuideContent", () => {
  it("server-renders the guide's representative Markdown examples", () => {
    const html = renderToStaticMarkup(
      React.createElement(SyntaxGuideContent, { t: (value) => value }),
    );

    expect(html).toContain("Markdown Syntax Guide");
    expect(html).toContain("Text Formatting");
    expect(html).toContain("```javascript");
    expect(html).toContain("Mermaid (code fence)");
    expect(html).toContain("Editor Shortcuts");
    expect(html).toContain('type="checkbox"');
  });
});
