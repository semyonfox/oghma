export interface SearchContextData {
  query?: string;
  scopeSize: number | null; // null = searched all notes
  resultsFound: number;
  results: { noteId: string; title: string; distance: number }[];
}

/**
 * Structured message segment. Assistant messages alternate text and tool
 * parts as the model streams; user messages are always a single text part.
 * `content` on Message remains the canonical concat of text parts (drives
 * the copy button, plain-text history feeds, search indexing).
 */
export type MessagePart =
  | { type: "text"; text: string }
  | {
      type: "tool";
      name: string;
      label: string;
      callId?: string;
      detail?: string;
    }
  | { type: "error"; text: string };

export interface MessageMetadata {
  thinking?: string;
  thinkingDuration?: number;
  finishReason?: string;
  rawFinishReason?: string;
  stepCount?: number;
  toolCallCount?: number;
  partial?: boolean;
  error?: string;
  toolCallLimitHit?: boolean;
  /** true when the generation was aborted (user stop or disconnect) */
  cancelled?: boolean;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  parts?: MessagePart[];
  thinking?: string;
  thinkingDuration?: number; // seconds from first thinking token to first content token
  partial?: boolean;
  error?: string;
  sources?: { id: string; title: string }[];
  retrieval?: {
    scopeMode: "global" | "scoped";
    availableCount: number;
    availableFiles: { id: string; title: string }[];
    semanticHits: { id: string; title: string }[];
    usedFiles: { id: string; title: string }[];
  };
  searchContext?: SearchContextData;
  timestamp: number;
  rating?: number | null;
}

/** Coerce arbitrary jsonb into a clean MessagePart[]; drops malformed entries. */
export function normalizeMessageParts(value: unknown): MessagePart[] | null {
  if (!Array.isArray(value)) return null;
  const parts: MessagePart[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as {
      type?: unknown;
      text?: unknown;
      name?: unknown;
      label?: unknown;
      callId?: unknown;
      detail?: unknown;
    };
    if (e.type === "text" && typeof e.text === "string") {
      parts.push({ type: "text", text: e.text });
    } else if (
      e.type === "tool" &&
      typeof e.name === "string" &&
      typeof e.label === "string"
    ) {
      parts.push({
        type: "tool",
        name: e.name,
        label: e.label,
        ...(typeof e.callId === "string" && { callId: e.callId }),
        ...(typeof e.detail === "string" && { detail: e.detail }),
      });
    } else if (e.type === "error" && typeof e.text === "string") {
      parts.push({ type: "error", text: e.text });
    }
  }
  return parts;
}

/** Group adjacent tool calls for a quieter, progressively disclosed UI. */
export type MessagePartGroup =
  | { type: "text"; text: string }
  | { type: "error"; text: string }
  | {
      type: "tool-group";
      tools: { name: string; label: string; detail?: string }[];
    };

export function groupMessageParts(parts: MessagePart[]): MessagePartGroup[] {
  const groups: MessagePartGroup[] = [];
  for (const part of parts) {
    if (part.type !== "tool") {
      groups.push(part);
      continue;
    }

    const last = groups[groups.length - 1];
    if (last?.type === "tool-group") {
      last.tools.push({
        name: part.name,
        label: part.label,
        detail: part.detail,
      });
    } else {
      groups.push({
        type: "tool-group",
        tools: [{ name: part.name, label: part.label, detail: part.detail }],
      });
    }
  }
  return groups;
}

export interface MessagePresentationParts {
  activity: MessagePart[];
  answer: MessagePart[];
  answerText: string;
  toolCount: number;
}

/**
 * Split execution activity from the final answer without changing the durable
 * message shape. Text is narration when another tool follows it; trailing text
 * is the answer. This intentionally converges to the same result for a fully
 * restored message and for the final state of an incrementally streamed one.
 */
export function partitionMessageParts(
  parts: MessagePart[] | undefined,
): MessagePresentationParts {
  const clean = (parts ?? []).filter(
    (part) => part.type !== "text" || part.text.trim().length > 0,
  );
  const lastToolIndex = clean.findLastIndex((part) => part.type === "tool");
  const activity = lastToolIndex >= 0 ? clean.slice(0, lastToolIndex + 1) : [];
  const answer = lastToolIndex >= 0 ? clean.slice(lastToolIndex + 1) : clean;

  return {
    activity,
    answer,
    answerText: answer
      .filter(
        (part): part is Extract<MessagePart, { type: "text" }> =>
          part.type === "text",
      )
      .map((part) => part.text)
      .join(""),
    toolCount: clean.filter((part) => part.type === "tool").length,
  };
}

export interface ChatContextItem {
  id: string;
  title: string;
}
