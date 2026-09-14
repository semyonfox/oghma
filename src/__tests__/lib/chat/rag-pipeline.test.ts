import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/lib/chat/rag-pipeline";

describe("chat system prompt", () => {
  it("leaves note search to the model when no content is preloaded", () => {
    const prompt = buildSystemPrompt([]);

    expect(prompt).toContain("No note content is preloaded");
    expect(prompt).toContain("when the question needs the user's notes");
    expect(prompt).toContain("General questions do not require a note search");
    expect(prompt).not.toContain("No relevant note content was retrieved");
    expect(prompt).not.toContain("Only after checking tools should you answer");
  });
});
