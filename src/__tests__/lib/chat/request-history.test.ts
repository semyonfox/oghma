import { describe, expect, it } from "vitest";
import { boundedChatHistory } from "@/lib/chat/request-history";
import { chatRequestSchema } from "@/lib/validations/schemas";
describe("bounded browser chat history", () => {
  it("keeps long conversations sendable without changing displayed messages", () => {
    const history = Array.from({ length: 100 }, (_, index) => ({
      role: index % 2 ? "assistant" : "user",
      content: `${index}:` + "x".repeat(30000),
    }));
    const bounded = boundedChatHistory(history);
    expect(history).toHaveLength(100);
    expect(history[99].content.length).toBeGreaterThan(20000);
    expect(bounded.at(-1)?.content).toMatch(/^99:/);
    expect(bounded.length).toBeLessThanOrEqual(20);
    expect(
      chatRequestSchema.safeParse({ message: "continue", history: bounded })
        .success,
    ).toBe(true);
  });
  it("bounds encoded bytes as well as character count", () => {
    const bounded = boundedChatHistory(
      Array(30).fill({ role: "assistant", content: "\u0000".repeat(30000) }),
    );
    expect(
      new TextEncoder().encode(JSON.stringify(bounded)).byteLength,
    ).toBeLessThan(128 * 1024 + 42);
  });
});
