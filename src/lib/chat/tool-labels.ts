// shared between server (route.ts) and client (parse-sse-frame.ts) so that the
// label baked into a persisted MessagePart matches what the SSE indicator shows
// during streaming.

const TOOL_CALL_LABELS: Record<string, string> = {
  getAppGuide: "Checking app guide",
  getChunks: "Searching notes",
  readNote: "Reading note",
  findFolder: "Looking up folder",
  makeMDNote: "Creating note",
  moveNote: "Moving note",
  renameNote: "Renaming note",
  getTimeBlocks: "Checking calendar",
  addTimeBlock: "Scheduling study block",
  completeTimeBlock: "Marking block complete",
  canvas_list_courses: "Reading Canvas courses",
  canvas_list_modules: "Reading Canvas modules",
  canvas_list_assignments: "Reading Canvas assignments",
  canvas_list_module_items: "Reading Canvas module items",
  canvas_get_file: "Reading Canvas file metadata",
};

/**
 * Humanize an unmapped tool name so the indicator is still readable.
 * `mcp__canvas__list_modules` → `Mcp canvas list modules`
 * `getTimeBlocks` → `Get time blocks`
 */
export function humanizeToolName(name: string): string {
  const cleaned = name
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!cleaned) return name;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/** Friendly label for a tool name; falls back to a humanized form. */
export function labelForTool(name: string): string {
  return TOOL_CALL_LABELS[name] ?? humanizeToolName(name);
}
