import { describe, expect, it, vi } from "vitest";
import { parseSseFrame, humanizeToolName } from "@/lib/chat/parse-sse-frame";
import { Metrics } from "@/lib/metrics";

describe("humanizeToolName", () => {
  it("turns camelCase into a sentence", () => {
    expect(humanizeToolName("getTimeBlocks")).toBe("Get time blocks");
  });

  it("turns snake_case into a sentence", () => {
    expect(humanizeToolName("canvas_list_courses")).toBe("Canvas list courses");
  });

  it("collapses repeated separators (e.g. mcp__server__action)", () => {
    expect(humanizeToolName("mcp__canvas__list_modules")).toBe(
      "Mcp canvas list modules",
    );
  });

  it("returns empty string for empty input", () => {
    expect(humanizeToolName("")).toBe("");
  });
});

describe("parseSseFrame — tool-call events", () => {
  it("uses a friendly label for known tools", () => {
    const update = parseSseFrame({
      event: "tool-call",
      data: JSON.stringify({ toolName: "getChunks" }),
    });
    expect(update).toEqual({
      type: "tool-call",
      toolName: "getChunks",
      label: "Searching notes",
    });
  });

  it("humanizes unknown tool names instead of leaking raw identifiers", () => {
    const update = parseSseFrame({
      event: "tool-call",
      data: JSON.stringify({ toolName: "mcp__canvas__list_assignments" }),
    });
    expect(update).toEqual({
      type: "tool-call",
      toolName: "mcp__canvas__list_assignments",
      label: "Mcp canvas list assignments",
    });
  });

  it("tolerates missing toolName without throwing", () => {
    const update = parseSseFrame({
      event: "tool-call",
      data: "{}",
    });
    expect(update).toEqual({
      type: "tool-call",
      toolName: "",
      label: "",
    });
  });

  it("tolerates malformed JSON payload", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const metricSpy = vi.spyOn(Metrics, "sseParseError").mockResolvedValue();

    try {
      const update = parseSseFrame({
        event: "tool-call",
        data: "not-json",
      });

      expect(update).toEqual({
        type: "tool-call",
        toolName: "",
        label: "",
      });
      expect(metricSpy).toHaveBeenCalledOnce();
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy).toHaveBeenCalledWith(
        "Malformed SSE frame payload",
        expect.objectContaining({ event: "tool-call" }),
      );
    } finally {
      warnSpy.mockRestore();
      metricSpy.mockRestore();
    }
  });
});

describe("parseSseFrame — search events", () => {
  it("uses safe defaults for malformed numeric payload fields", () => {
    const update = parseSseFrame({
      event: "search",
      data: JSON.stringify({
        scopeSize: "all",
        resultsFound: "many",
        results: "not-an-array",
      }),
    });

    expect(update).toEqual({
      type: "search",
      searchContext: {
        scopeSize: null,
        resultsFound: 0,
        results: [],
      },
    });
  });

  it("preserves valid search summary counts", () => {
    const update = parseSseFrame({
      event: "search",
      data: JSON.stringify({
        scopeSize: 3,
        resultsFound: 2,
        results: [{ noteId: "note-1", title: "Intro", distance: 0.12 }],
      }),
    });

    expect(update).toEqual({
      type: "search",
      searchContext: {
        scopeSize: 3,
        resultsFound: 2,
        results: [{ noteId: "note-1", title: "Intro", distance: 0.12 }],
      },
    });
  });
});

describe("parseSseFrame — lifecycle events", () => {
  it("parses done events as explicit stream completion", () => {
    expect(parseSseFrame({ event: "done", data: "{}" })).toEqual({
      type: "done",
    });
  });
});
