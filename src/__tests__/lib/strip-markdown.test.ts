import { describe, expect, it } from "vitest";
import { stripMarkdown } from "@/lib/strip-markdown";

describe("stripMarkdown", () => {
  it("removes heading and list syntax while preserving text", () => {
    const input = "# Title\n- item one\n1. item two\n> quote";
    expect(stripMarkdown(input)).toBe("Title\nitem one\nitem two\nquote");
  });

  it("removes emphasis and strikethrough markers", () => {
    const input = "**bold** *italic* __under__ ~~gone~~";
    expect(stripMarkdown(input)).toBe("bold italic under gone");
  });

  it("keeps link and image text without markdown punctuation", () => {
    const input = "Read [docs](https://example.com) ![diagram](img.png)";
    expect(stripMarkdown(input)).toBe("Read docs diagram");
  });

  it("handles images nested inside links", () => {
    const input = "[![diagram](img.png)](https://example.com/docs)";
    expect(stripMarkdown(input)).toBe("diagram");
  });

  it("keeps fenced code content but strips fence syntax", () => {
    const input = "```ts\nconst a = 1;\n```";
    expect(stripMarkdown(input)).toBe("const a = 1;");
  });

  it("strips html tags and collapses excessive blank lines", () => {
    const input = "<p>Hello</p>\n\n\n\n<strong>World</strong>";
    expect(stripMarkdown(input)).toBe("Hello\n\nWorld");
  });
});
