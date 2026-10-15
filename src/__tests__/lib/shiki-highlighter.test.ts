import { describe, expect, it } from "vitest";
import { highlightCode, MAX_HIGHLIGHT_CHARS } from "@/lib/markdown/shiki-highlighter";

describe("Shiki highlighter", () => {
  it("normalizes supported language aliases and returns highlighted tokens", async () => {
    const result = await highlightCode("const value = 1", "js");

    expect(result.lang).toBe("javascript");
    expect(result.tokens.flat().some((token) => token.color)).toBe(true);
  });

  it("uses plaintext tokens for unsupported languages", async () => {
    const result = await highlightCode("const value = 1", "madeuplang");

    expect(result.lang).toBe("plaintext");
    expect(result.tokens.flat().map((token) => token.content).join("")).toBe(
      "const value = 1",
    );
  });
});

describe("Shiki highlighter bounds", () => {
  it("renders oversized code as plain text instead of tokenizing the grammar", async () => {
    const code = `const value = 1;\n`.repeat(
      Math.ceil((MAX_HIGHLIGHT_CHARS + 1) / 17),
    );

    const result = await highlightCode(code, "typescript");

    expect(result.lang).toBe("plaintext");
    expect(result.tokens.length).toBeGreaterThan(1);
  });
});
