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

const emptyRagResult = {
  searchResults: [],
  semanticMatches: [],
  embeddingAvailable: false,
  ragFailed: false,
};

describe("prepareChatGeneration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runRagPipeline.mockResolvedValue(emptyRagResult);
    mocks.runKeywordFallback.mockResolvedValue([]);
    mocks.buildRetrievalInfo.mockResolvedValue({
      uniqueSources: [],
      retrieval: {
        scopeMode: "global",
        availableCount: 0,
        availableFiles: [],
        semanticHits: [],
        usedFiles: [],
      },
    });
  });

  it("keeps plain chat free of retrieval work", async () => {
    const prepared = await prepareChatGeneration({
      userId: "11111111-1111-1111-1111-111111111111",
      message: "hello",
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

  it("uses keyword fallback only for an explicitly scoped empty search", async () => {
    const keywordHit = {
      note_id: "22222222-2222-2222-2222-222222222222",
      title: "Networks",
      chunk_id: "33333333-3333-3333-3333-333333333333",
      chunk_text: "OSI layers",
      distance: null,
    };
    mocks.runKeywordFallback.mockResolvedValue([keywordHit]);

    await prepareChatGeneration({
      userId: "11111111-1111-1111-1111-111111111111",
      message: "OSI",
      useRag: true,
      scopedNoteIds: [keywordHit.note_id],
      sessionContext: createEmptyChatSessionContext(),
    });

    expect(mocks.runKeywordFallback).toHaveBeenCalledOnce();
    expect(mocks.buildSystemPrompt).toHaveBeenCalledWith([keywordHit]);
  });
});
