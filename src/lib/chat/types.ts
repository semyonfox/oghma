export interface SearchContextData {
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
  | { type: "tool"; name: string; label: string }
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
    const e = entry as { type?: unknown; text?: unknown; name?: unknown; label?: unknown };
    if (e.type === "text" && typeof e.text === "string") {
      parts.push({ type: "text", text: e.text });
    } else if (
      e.type === "tool" &&
      typeof e.name === "string" &&
      typeof e.label === "string"
    ) {
      parts.push({ type: "tool", name: e.name, label: e.label });
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
  | { type: "tool-group"; tools: { name: string; label: string }[] };

export function groupMessageParts(parts: MessagePart[]): MessagePartGroup[] {
  const groups: MessagePartGroup[] = [];
  for (const part of parts) {
    if (part.type !== "tool") {
      groups.push(part);
      continue;
    }

    const last = groups[groups.length - 1];
    if (last?.type === "tool-group") {
      last.tools.push({ name: part.name, label: part.label });
    } else {
      groups.push({
        type: "tool-group",
        tools: [{ name: part.name, label: part.label }],
      });
    }
  }
  return groups;
}

export interface ChatContextItem {
  id: string;
  title: string;
}
