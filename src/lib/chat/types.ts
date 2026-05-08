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
  | { type: "tool"; name: string; label: string };

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  parts?: MessagePart[];
  thinking?: string;
  thinkingDuration?: number; // seconds from first thinking token to first content token
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
    }
  }
  return parts;
}

export interface ChatContextItem {
  id: string;
  title: string;
}
