import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildSystemPrompt: vi.fn(() => "rag prompt"),
  buildPlainSystemPrompt: vi.fn(() => "plain prompt"),
}));

vi.mock("@/lib/chat/system-prompt", () => ({
  buildSystemPrompt: mocks.buildSystemPrompt,
  buildPlainSystemPrompt: mocks.buildPlainSystemPrompt,
}));

import { createEmptyChatSessionContext } from "@/lib/chat/session";
import { prepareChatGeneration } from "@/lib/chat/prepare-generation";

describe("prepareChatGeneration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does no eager retrieval work when note tools are disabled", async () => {
    const prepared = await prepareChatGeneration({
      useRag: false,
      scopedNoteIds: null,
      sessionContext: createEmptyChatSessionContext(),
    });

    expect(prepared.systemPrompt).toBe("plain prompt");
    expect(prepared.initialParts).toEqual([]);
  });

  it("leaves note retrieval to scoped model tools", async () => {
    const prepared = await prepareChatGeneration({
      useRag: true,
      scopedNoteIds: ["22222222-2222-2222-2222-222222222222"],
      sessionContext: createEmptyChatSessionContext(),
    });

    expect(prepared.systemPrompt).toBe("rag prompt");
    expect(prepared.initialParts).toEqual([]);
    expect(prepared.uniqueSources).toEqual([]);
    expect(prepared.retrieval).toMatchObject({
      scopeMode: "scoped",
      availableCount: 0,
      semanticHits: [],
      usedFiles: [],
    });
    expect(mocks.buildSystemPrompt).toHaveBeenCalledOnce();
  });
});
