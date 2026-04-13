// SSE event helpers: send metadata, search results, tokens, and errors over the stream

import { toSseEvent } from "@/lib/chat/sse";
import { getTraceId } from "@/lib/trace";
import type { SearchResult } from "@/lib/chat/rag-pipeline";
import type { RetrievalInfo, SourceRef } from "@/lib/chat/rag-context";

export interface SseWriter {
  enqueue(chunk: Uint8Array): void;
  close(): void;
}

const encoder = new TextEncoder();

function send(writer: SseWriter, event: string, payload: unknown): void {
  writer.enqueue(encoder.encode(toSseEvent(event, payload)));
}

export function sendConnected(writer: SseWriter): void {
  writer.enqueue(encoder.encode(": connected\n\n"));
}

export function sendMeta(
  writer: SseWriter,
  sessionId: string,
  sources: SourceRef[],
  retrieval: RetrievalInfo,
  ragAvailable: boolean,
  llmAvailable: boolean,
): void {
  send(writer, "meta", {
    sessionId,
    sources,
    retrieval,
    ragAvailable,
    llmAvailable,
  });
}

export function sendSearch(
  writer: SseWriter,
  scopedNoteIds: string[] | null,
  searchResults: SearchResult[],
): void {
  send(writer, "search", {
    scopeSize: scopedNoteIds?.length ?? null,
    resultsFound: searchResults.length,
    results: searchResults.map((r) => ({
      noteId: r.note_id,
      title: r.title || "Untitled",
      distance: r.distance,
    })),
  });
}

export function sendToken(writer: SseWriter, text: string): void {
  send(writer, "token", { text });
}

export function sendThinking(writer: SseWriter, text: string): void {
  send(writer, "thinking", { text });
}

export function sendToolCall(writer: SseWriter, toolName: string): void {
  send(writer, "tool-call", { toolName });
}

export function sendDone(writer: SseWriter): void {
  send(writer, "done", {});
}

export function sendError(writer: SseWriter, message: string): void {
  send(writer, "error", { message, traceId: getTraceId() });
}

export function buildSearchContext(
  scopedNoteIds: string[] | null,
  searchResults: SearchResult[],
): {
  scopeSize: number | null;
  resultsFound: number;
  results: { noteId: string; title: string; distance: number }[];
} {
  return {
    scopeSize: scopedNoteIds?.length ?? null,
    resultsFound: searchResults.length,
    results: searchResults.map((r) => ({
      noteId: r.note_id,
      title: r.title || "Untitled",
      distance: r.distance,
    })),
  };
}
