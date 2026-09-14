import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runRagPipeline: vi.fn(),
  runKeywordFallback: vi.fn(),
  buildSystemPrompt: vi.fn(() => "rag prompt"),
  buildPlainSystemPrompt: vi.fn(() => "plain prompt"),
  buildRetrievalInfo: vi.fn(),
}));

vi.mock("@/lib/chat/rag-pipeline", () => ({
  runRagPipeline: mocks.runRagPipeline,
  runKeywordFallback: mocks.runKeywordFallback,
  buildSystemPrompt: mocks.buildSystemPrompt,
  buildPlainSystemPrompt: mocks.buildPlainSystemPrompt,
}));
vi.mock("@/lib/chat/rag-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/chat/rag-context")>()),
  buildRetrievalInfo: mocks.buildRetrievalInfo,
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
    expect(mocks.runRagPipeline).not.toHaveBeenCalled();
    expect(mocks.runKeywordFallback).not.toHaveBeenCalled();
    expect(mocks.buildRetrievalInfo).not.toHaveBeenCalled();
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
    expect(mocks.buildSystemPrompt).toHaveBeenCalledWith([]);
    expect(mocks.runRagPipeline).not.toHaveBeenCalled();
    expect(mocks.runKeywordFallback).not.toHaveBeenCalled();
    expect(mocks.buildRetrievalInfo).not.toHaveBeenCalled();
  });
});
