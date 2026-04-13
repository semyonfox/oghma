import type { SseFrame } from "@/lib/chat/sse";
import type { Message, SearchContextData } from "@/lib/chat/types";

// labels shown while a tool call is in progress
const TOOL_CALL_LABELS: Record<string, string> = {
  getChunks: "Searching notes",
  readNote: "Reading note",
  findFolder: "Looking up folder",
  makeMDNote: "Creating note",
  canvas_list_courses: "Reading Canvas courses",
  canvas_list_modules: "Reading Canvas modules",
  canvas_list_assignments: "Reading Canvas assignments",
  canvas_list_module_items: "Reading Canvas module items",
  canvas_get_file: "Reading Canvas file metadata",
};

/** a single mutation that should be applied to the assistant message */
export type MessageUpdate =
  | { type: "meta"; sessionId?: string; sources?: { id: string; title: string }[]; retrieval?: Message["retrieval"] }
  | { type: "search"; searchContext: SearchContextData }
  | { type: "thinking"; text: string }
  | { type: "token"; text: string; thinkingDuration?: number }
  | { type: "tool-call"; label: string }
  | { type: "error"; message: string };

/**
 * Parses a single SSE frame into a structured update.
 * Pure function -- no React state, no side effects.
 */
export function parseSseFrame(frame: SseFrame): MessageUpdate | null {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(frame.data);
  } catch {
    payload = {};
  }

  switch (frame.event) {
    case "meta": {
      return {
        type: "meta",
        sessionId: typeof payload.sessionId === "string" ? payload.sessionId : undefined,
        sources: Array.isArray(payload.sources) ? (payload.sources as { id: string; title: string }[]) : undefined,
        retrieval: payload.retrieval as Message["retrieval"] | undefined,
      };
    }

    case "search": {
      return {
        type: "search",
        searchContext: {
          scopeSize: (payload.scopeSize as number) ?? null,
          resultsFound: (payload.resultsFound as number) ?? 0,
          results: Array.isArray(payload.results)
            ? (payload.results as SearchContextData["results"])
            : [],
        },
      };
    }

    case "thinking": {
      const text = typeof payload.text === "string" ? payload.text : "";
      if (!text) return null;
      return { type: "thinking", text };
    }

    case "token": {
      const text = typeof payload.text === "string" ? payload.text : "";
      if (!text) return null;
      return { type: "token", text };
    }

    case "tool-call": {
      const toolName = typeof payload.toolName === "string" ? payload.toolName : "";
      const label = TOOL_CALL_LABELS[toolName] ?? toolName;
      return { type: "tool-call", label };
    }

    case "error": {
      const message = typeof payload.message === "string" ? payload.message : "";
      return { type: "error", message };
    }

    default:
      return null;
  }
}
