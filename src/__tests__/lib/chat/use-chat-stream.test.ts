import { describe, expect, it } from "vitest";
import type { MutableRefObject } from "react";
import { applyUpdate } from "@/lib/chat/hooks/use-chat-stream";
import { mapStoredChatMessages } from "@/lib/chat/hooks/use-chat-persistence";
import type { Message } from "@/lib/chat/types";

function ref(): MutableRefObject<number | null> {
  return { current: null };
}

function baseMsg(content = "", parts: Message["parts"] = []): Message {
  return {
    id: "msg-1",
    role: "assistant",
    content,
    parts,
    timestamp: 0,
  };
}

describe("applyUpdate — token + tool-call parts", () => {
  it("renders the initial RAG search with its query and matched note", () => {
    const msg = applyUpdate(
      baseMsg(),
      {
        type: "search",
        searchContext: {
          query: "invalid HTML syntax",
          scopeSize: null,
          resultsFound: 1,
          results: [{ noteId: "note-1", title: "Complete Syntax", distance: 0.2 }],
        },
      },
      ref(),
    );

    expect(msg.parts).toEqual([
      {
        type: "tool",
        name: "ragSearch",
        label: "Searched notes",
        detail: "“invalid HTML syntax” · Complete Syntax",
      },
    ]);
  });

  it("appends a token to the trailing text part", () => {
    const a = applyUpdate(baseMsg(), { type: "token", text: "hello" }, ref());
    expect(a.content).toBe("hello");
    expect(a.parts).toEqual([{ type: "text", text: "hello" }]);

    const b = applyUpdate(a, { type: "token", text: " world" }, ref());
    expect(b.content).toBe("hello world");
    expect(b.parts).toEqual([{ type: "text", text: "hello world" }]);
  });

  it("inserts a tool part between text segments and keeps content as plain prose", () => {
    let msg = applyUpdate(baseMsg(), { type: "token", text: "looking now." }, ref());
    msg = applyUpdate(
      msg,
      { type: "tool-call", toolName: "getChunks", label: "Searching notes" },
      ref(),
    );
    msg = applyUpdate(msg, { type: "token", text: "found three" }, ref());

    expect(msg.content).toBe("looking now.found three");
    expect(msg.parts).toEqual([
      { type: "text", text: "looking now." },
      { type: "tool", name: "getChunks", label: "Searching notes" },
      { type: "text", text: "found three" },
    ]);
  });

  it("supports back-to-back tool calls without dropping prior text", () => {
    let msg = applyUpdate(baseMsg(), { type: "token", text: "thinking…" }, ref());
    msg = applyUpdate(
      msg,
      { type: "tool-call", toolName: "getChunks", label: "Searching notes" },
      ref(),
    );
    msg = applyUpdate(
      msg,
      { type: "tool-call", toolName: "readNote", label: "Reading note" },
      ref(),
    );

    expect(msg.parts).toEqual([
      { type: "text", text: "thinking…" },
      { type: "tool", name: "getChunks", label: "Searching notes" },
      { type: "tool", name: "readNote", label: "Reading note" },
    ]);
    expect(msg.content).toBe("thinking…");
  });

  it("opens a fresh text part when tokens arrive after a tool call", () => {
    let msg = applyUpdate(
      baseMsg(),
      { type: "tool-call", toolName: "getChunks", label: "Searching notes" },
      ref(),
    );
    msg = applyUpdate(msg, { type: "token", text: "ok" }, ref());

    expect(msg.parts).toEqual([
      { type: "tool", name: "getChunks", label: "Searching notes" },
      { type: "text", text: "ok" },
    ]);
  });

  it("updates a completed read with the returned note title", () => {
    const started = applyUpdate(
      baseMsg(),
      {
        type: "tool-call",
        toolName: "readNote",
        label: "Reading note",
        toolCallId: "read-1",
        detail: "154b1133-54df-4e0e-a154-9b637750f106",
      },
      ref(),
    );
    const completed = applyUpdate(
      started,
      { type: "tool-result", toolCallId: "read-1", detail: "Complete Syntax" },
      ref(),
    );

    expect(completed.parts).toEqual([
      expect.objectContaining({ type: "tool", detail: "Complete Syntax" }),
    ]);
  });

  it("records stream errors as partial message parts", () => {
    const msg = applyUpdate(
      baseMsg("partial", [{ type: "text", text: "partial" }]),
      { type: "error", message: "Tool-call limit reached" },
      ref(),
    );

    expect(msg.partial).toBe(true);
    expect(msg.error).toBe("Tool-call limit reached");
    expect(msg.parts).toEqual([
      { type: "text", text: "partial" },
      { type: "error", text: "Tool-call limit reached" },
    ]);
  });
});

describe("background chat restore", () => {
  it("clears partial output when a durable worker attempt is retried", () => {
    const message = baseMsg("partial answer", [
      { type: "text", text: "partial answer" },
    ]);

    expect(applyUpdate(message, { type: "reset" }, ref())).toEqual(
      expect.objectContaining({
        content: "",
        parts: [],
        thinking: undefined,
        error: undefined,
      }),
    );
  });

  it("maps a persisted background answer back to the live message shape", () => {
    expect(
      mapStoredChatMessages([
        {
          id: "answer-1",
          role: "assistant",
          content: "Finished while away",
          parts: [{ type: "text", text: "Finished while away" }],
          metadata: { thinkingDuration: 4 },
          created_at: "2026-07-15T00:00:00.000Z",
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        id: "answer-1",
        role: "assistant",
        content: "Finished while away",
        parts: [{ type: "text", text: "Finished while away" }],
        thinkingDuration: 4,
      }),
    ]);
  });
});
