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

  it("extracts text from structured content arrays", () => {
    const text = extractProviderText({
      choices: [
        {
          delta: {
            content: [{ type: "text", text: "hello " }, { text: "world" }],
          },
        },
      ],
    });
    expect(text).toBe("hello world");
  });

  it("extracts text from choice.message.content fallback", () => {
    const text = extractProviderText({
      choices: [{ message: { content: "final answer" } }],
    });
    expect(text).toBe("final answer");
  });
});
