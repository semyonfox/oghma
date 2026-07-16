function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** A short, non-sensitive description for the activity UI. Never includes note content. */
export function toolCallDetail(toolName: string, input: unknown): string | undefined {
  const value = record(input);
  if (!value) return undefined;

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
