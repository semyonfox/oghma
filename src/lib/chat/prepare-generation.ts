import {
  buildPlainSystemPrompt,
  buildSystemPrompt,
} from "@/lib/chat/rag-pipeline";
import {
  type RetrievalInfo,
  type SourceRef,
} from "@/lib/chat/rag-context";
import { buildSessionMemoryPrompt } from "@/lib/chat/normalize-scope";
import type { ChatSessionContext } from "@/lib/chat/session";
import type { MessagePart } from "@/lib/chat/types";

const LLM_UNAVAILABLE_REPLY =
  "The AI service is temporarily unavailable. Please try again shortly.";

export interface PreparedChatGeneration {
  systemPrompt: string;
  sessionMemoryPrompt: string;
  uniqueSources: SourceRef[];
  retrieval: RetrievalInfo;
  initialParts: MessagePart[];
  fallbackReply: string;
}

/**
 * Build the shared prompt and empty initial delivery state. Note retrieval is
 * model-directed through getChunks/readNote, so no semantic search or note
 * content is injected before the model decides it needs it.
 */
export async function prepareChatGeneration(input: {
  useRag: boolean;
  scopedNoteIds: string[] | null;
  sessionContext: ChatSessionContext;
}): Promise<PreparedChatGeneration> {
  const systemPrompt = input.useRag
    ? buildSystemPrompt([])
    : buildPlainSystemPrompt();
  const retrieval: RetrievalInfo = {
    scopeMode: input.scopedNoteIds === null ? "global" : "scoped",
    availableCount: 0,
    availableFiles: [],
    semanticHits: [],
    usedFiles: [],
  };

  return {
    systemPrompt,
    sessionMemoryPrompt: buildSessionMemoryPrompt(input.sessionContext),
    uniqueSources: [],
    retrieval,
    initialParts: [],
    fallbackReply: LLM_UNAVAILABLE_REPLY,
  };
}
