import { describe, expect, it } from "vitest";
import type { MutableRefObject } from "react";
import { applyUpdate } from "@/lib/chat/hooks/use-chat-stream";
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
