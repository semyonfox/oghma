import { describe, expect, it } from "vitest";
import { extractProviderText } from "@/lib/chat/llm-stream";

describe("extractProviderText", () => {
  it("extracts OpenAI-compatible delta content", () => {
    const text = extractProviderText({
      choices: [{ delta: { content: "hi" } }],
    });
    expect(text).toBe("hi");
  });

  it("returns empty for non-content chunks", () => {
    const text = extractProviderText({ choices: [{ delta: {} }] });
    expect(text).toBe("");
  });
});
