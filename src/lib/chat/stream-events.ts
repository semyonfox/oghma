import { toSseEvent } from "@/lib/chat/sse";
import { getTraceId } from "@/lib/trace";
import type { NoteActivityRef } from "@/lib/chat/types";

export interface SourceRef {
  id: string;
  title: string;
}

export interface RetrievalInfo {
  scopeMode: "global" | "scoped";
  availableCount: number;
  availableFiles: SourceRef[];
  semanticHits: SourceRef[];
  usedFiles: SourceRef[];
}

export interface SseWriter {
  enqueue(chunk: Uint8Array): void;
  close(): void;
  appendText?(kind: "token" | "thinking", text: string): void;
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

export function sendToken(writer: SseWriter, text: string): void {
  if (writer.appendText) writer.appendText("token", text);
  else send(writer, "token", { text });
}

export function sendThinking(writer: SseWriter, text: string): void {
  if (writer.appendText) writer.appendText("thinking", text);
  else send(writer, "thinking", { text });
}

export function sendToolCall(
  writer: SseWriter,
  toolName: string,
  toolCallId?: string,
  detail?: string,
): void {
  send(writer, "tool-call", { toolName, toolCallId, detail });
}

export function sendToolResult(
  writer: SseWriter,
  toolCallId: string,
  detail?: string,
  status: "completed" | "failed" = "completed",
  notes: NoteActivityRef[] = [],
  actionId?: string,
): void {
  send(writer, "tool-result", { toolCallId, detail, status, notes, actionId });
}

export function sendDone(writer: SseWriter): void {
  send(writer, "done", {});
}

export function sendError(writer: SseWriter, message: string): void {
  send(writer, "error", { message, traceId: getTraceId() });
}

export function sendHeartbeat(writer: SseWriter): void {
  writer.enqueue(encoder.encode(": heartbeat\n\n"));
}
