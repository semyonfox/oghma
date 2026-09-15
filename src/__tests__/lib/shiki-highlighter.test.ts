import { describe, expect, it } from "vitest";
import { highlightCode } from "@/lib/markdown/shiki-highlighter";

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
