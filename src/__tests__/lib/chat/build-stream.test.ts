import { describe, expect, it } from "vitest";

import { buildChatPrompt } from "@/lib/chat/build-stream";

describe("buildChatPrompt", () => {
  it("keeps system content in instructions and out of messages", () => {
    const prompt = buildChatPrompt({
      systemPrompt: "Base instructions",
      sessionMemoryPrompt: "Remember the active course",
      toolInstruction: "Use note tools when needed",
      history: [
        { role: "system", content: "Preserve the user's formatting" },
        { role: "user", content: "Earlier question" },
        { role: "assistant", content: "Earlier answer" },
      ],
      message: "Current question",
    });

    expect(prompt.instructions).toBe(
      "Base instructions\n\n" +
        "Remember the active course\n\n" +
        "Use note tools when needed\n\n" +
        "Preserve the user's formatting",
    );
    expect(prompt.messages).toEqual([
      { role: "user", content: "Earlier question" },
      { role: "assistant", content: "Earlier answer" },
      { role: "user", content: "Current question" },
    ]);
    expect(prompt.messages).not.toContainEqual(
      expect.objectContaining({ role: "system" }),
    );
  });
});
