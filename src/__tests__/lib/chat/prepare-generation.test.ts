import { describe, expect, it } from "vitest";

import { createEmptyChatSessionContext } from "@/lib/chat/session";
import { prepareChatGeneration } from "@/lib/chat/prepare-generation";

describe("prepareChatGeneration", () => {
  it("does no eager retrieval work when note tools are disabled", async () => {
    const prepared = await prepareChatGeneration({
      useRag: false,
      scopedNoteIds: null,
      sessionContext: createEmptyChatSessionContext(),
    });

    expect(prepared.systemPrompt).toContain("Note retrieval is turned off");
    expect(prepared.systemPrompt).not.toMatch(/getChunks|readNote/);
    expect(prepared.initialParts).toEqual([]);
  });

  it("leaves note retrieval to scoped model tools", async () => {
    const prepared = await prepareChatGeneration({
      useRag: true,
      scopedNoteIds: ["22222222-2222-2222-2222-222222222222"],
      sessionContext: createEmptyChatSessionContext(),
    });

    expect(prepared.systemPrompt).toContain("No note content is preloaded");
    expect(prepared.systemPrompt).toMatch(/getChunks or readNote when the question needs the user's notes/);
    expect(prepared.systemPrompt).toContain("General questions do not require a note search");
    expect(prepared.initialParts).toEqual([]);
    expect(prepared.uniqueSources).toEqual([]);
    expect(prepared.retrieval).toMatchObject({
      scopeMode: "scoped",
      availableCount: 0,
      semanticHits: [],
      usedFiles: [],
    });
  });
});
