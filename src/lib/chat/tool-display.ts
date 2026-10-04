import { normalizeNoteActivityRefs, type NoteActivityRef } from "@/lib/chat/types";

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** Note titles and IDs only; tool outputs may also contain private note content. */
export function noteRefsFromToolResult(toolName: string, output: unknown): NoteActivityRef[] {
  const value = record(output);
  if (!value) return [];
  if (toolName === "getChunks") {
    if (!Array.isArray(value.results)) return [];
    return normalizeNoteActivityRefs(value.results.map((result) => {
      const row = record(result);
      return row ? { id: row.noteId, title: row.title } : null;
    }));
  }
  if (toolName === "readNote") {
    return normalizeNoteActivityRefs([{ id: value.noteId, title: value.title }]);
  }
  return [];
}

/** A short, non-sensitive description for the activity UI. Never includes note content. */
export function toolCallDetail(toolName: string, input: unknown): string | undefined {
  const value = record(input);
  if (!value) return undefined;

  if (toolName === "getAppGuide" && typeof value.topic === "string") {
    return value.topic
      .replace(/-/g, " ")
      .replace(/^./, (first) => first.toUpperCase());
  }
  if (toolName === "getChunks" && typeof value.query === "string") {
    return `“${value.query}”`;
  }
  if (toolName === "findFolder" && typeof value.query === "string") {
    return `“${value.query}”`;
  }
  if (toolName === "readNote" && typeof value.noteId === "string") {
    return value.noteId;
  }
  return undefined;
}

/** Replace an ID-only detail with the human-readable title returned by readNote. */
export function toolResultDetail(toolName: string, output: unknown): string | undefined {
  const value = record(output);
  if (toolName === "readNote" && value && typeof value.title === "string" && value.title.trim()) {
    return value.title.trim();
  }
  return undefined;
}

export function noteSearchDetail(query: string, results: { title: string }[]): string {
  const titles = [...new Set(results.map((result) => result.title.trim()).filter(Boolean))];
  if (titles.length === 0) return `“${query}” · No matching notes`;
  const visible = titles.slice(0, 3).join(", ");
  const remainder = titles.length - 3;
  return `“${query}” · ${visible}${remainder > 0 ? ` +${remainder} more` : ""}`;
}
