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
  | { type: "reasoning"; text: string }
  | {
      type: "tool";
      name: string;
      label: string;
      callId?: string;
      detail?: string;
      resultDetail?: string;
      status?: "running" | "completed" | "failed" | "interrupted";
    }
  | { type: "error"; text: string };

export interface MessageMetadata {
  [key: string]: string | number | boolean | undefined;
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
  /** Keep the mounted bubble when an optimistic message receives its saved ID. */
  renderKey?: string;
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

/** Accept rows written before the double-encoding fix without rewriting stored data. */
export function decodeStoredChatJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** Coerce arbitrary jsonb into a clean MessagePart[]; drops malformed entries. */
export function normalizeMessageParts(value: unknown): MessagePart[] | null {
  value = decodeStoredChatJson(value);
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
      resultDetail?: unknown;
      status?: unknown;
    };
    if (
      (e.type === "text" || e.type === "reasoning") &&
      typeof e.text === "string"
    ) {
      parts.push({ type: e.type, text: e.text });
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
        ...(typeof e.resultDetail === "string" && {
          resultDetail: e.resultDetail,
        }),
        ...((e.status === "running" ||
          e.status === "completed" ||
          e.status === "failed" ||
          e.status === "interrupted") && { status: e.status }),
      });
    } else if (e.type === "error" && typeof e.text === "string") {
      parts.push({ type: "error", text: e.text });
    }
  }
  return parts;
}

export interface MessagePresentationParts {
  activity: MessagePart[];
  answer: MessagePart[];
  answerText: string;
  toolCount: number;
}

/**
 * Find the final answer for copying and generation validation. Earlier text is
 * narration when reasoning or another tool follows it. Rendering keeps all parts
 * in their original positions, including narration.
 */
export function partitionMessageParts(
  parts: MessagePart[] | undefined,
): MessagePresentationParts {
  const clean = (parts ?? []).filter(
    (part) => part.type !== "text" || part.text.trim().length > 0,
  );
  const lastActivityIndex = clean.findLastIndex(
    (part) => part.type === "tool" || part.type === "reasoning",
  );
  const activity = lastActivityIndex >= 0 ? clean.slice(0, lastActivityIndex + 1) : [];
  const answer = lastActivityIndex >= 0 ? clean.slice(lastActivityIndex + 1) : clean;

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

/** Preserve the position of provider reasoning alongside prose and tool calls. */
export function appendReasoningPart(
  parts: MessagePart[],
  text: string,
): MessagePart[] {
  const last = parts.at(-1);
  return last?.type === "reasoning"
    ? [...parts.slice(0, -1), { type: "reasoning", text: last.text + text }]
    : [...parts, { type: "reasoning", text }];
}

export function interruptRunningTools(parts: MessagePart[]): MessagePart[] {
  return parts.map((part) =>
    part.type === "tool" && part.status === "running"
      ? { ...part, status: "interrupted" }
      : part,
  );
}
