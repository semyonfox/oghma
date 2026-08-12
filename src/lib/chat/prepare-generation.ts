import {
  buildPlainSystemPrompt,
  buildSystemPrompt,
  runKeywordFallback,
  runRagPipeline,
  type RagResult,
} from "@/lib/chat/rag-pipeline";
import {
  buildFallbackReply,
  buildRetrievalInfo,
  type RetrievalInfo,
  type SourceRef,
} from "@/lib/chat/rag-context";
import { buildInitialChatParts } from "@/lib/chat/generation-result";
import { buildSessionMemoryPrompt } from "@/lib/chat/normalize-scope";
import type { ChatSessionContext } from "@/lib/chat/session";
import type { MessagePart } from "@/lib/chat/types";

const EMPTY_RAG_RESULT: RagResult = {
  searchResults: [],
  semanticMatches: [],
  embeddingAvailable: false,
  ragFailed: false,
};

const EMPTY_RETRIEVAL: RetrievalInfo = {
  scopeMode: "global",
  availableCount: 0,
  availableFiles: [],
  semanticHits: [],
  usedFiles: [],
};

export interface PreparedChatGeneration {
  ragResult: RagResult;
  systemPrompt: string;
  sessionMemoryPrompt: string;
  uniqueSources: SourceRef[];
  retrieval: RetrievalInfo;
  initialParts: MessagePart[];
  fallbackReply: string;
}

/**
 * Resolve the request's retrieval context once, before choosing a transport.
 * Inline, background, and JSON responses all consume this same shape so their
 * prompts, citations, and no-provider fallback cannot drift apart.
 */
export async function prepareChatGeneration(input: {
  userId: string;
  message: string;
  useRag: boolean;
  scopedNoteIds: string[] | null;
  sessionContext: ChatSessionContext;
}): Promise<PreparedChatGeneration> {
  const ragResult = input.useRag
    ? await runRagPipeline(input.userId, input.message, input.scopedNoteIds)
    : EMPTY_RAG_RESULT;
  const keywordResults =
    input.useRag &&
    input.scopedNoteIds !== null &&
    ragResult.searchResults.length === 0
      ? await runKeywordFallback(
          input.userId,
          input.message,
          input.scopedNoteIds,
        )
      : [];
  const systemPrompt = input.useRag
    ? buildSystemPrompt([...ragResult.searchResults, ...keywordResults])
    : buildPlainSystemPrompt();
  const retrievalContext = input.useRag
    ? await buildRetrievalInfo(
        input.userId,
        input.scopedNoteIds,
        ragResult,
      )
    : { uniqueSources: [], retrieval: EMPTY_RETRIEVAL };

  return {
    ragResult,
    systemPrompt,
    sessionMemoryPrompt: buildSessionMemoryPrompt(input.sessionContext),
    ...retrievalContext,
    initialParts: buildInitialChatParts(
      input.useRag,
      input.message,
      ragResult.searchResults,
    ),
    fallbackReply: buildFallbackReply(
      ragResult.searchResults,
      ragResult.embeddingAvailable,
    ),
  };
}
