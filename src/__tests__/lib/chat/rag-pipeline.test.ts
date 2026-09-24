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

  it("includes verified note IDs beside retrieved titles for links", () => {
    const noteId = "01962eb7-3571-7a2b-9c4d-5e6f7a8b9c0d";
    const prompt = buildSystemPrompt([{
      note_id: noteId,
      title: "Lecture 1",
      chunk_text: "The course introduction",
      distance: 0.1,
    }]);

    expect(prompt).toContain(`"Lecture 1" (id: ${noteId})`);
  });
});
