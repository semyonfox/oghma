import { describe, expect, it } from "vitest";
import { parseSseBlocks, toSseEvent } from "@/lib/chat/sse";

describe("chat SSE utils", () => {
  it("formats event payload as SSE block", () => {
    const out = toSseEvent("token", { text: "hi" });
    expect(out).toBe('event: token\ndata: {"text":"hi"}\n\n');
  });

  it("parses complete SSE blocks from chunked input", () => {
    const state = { buffer: "" };

    const first = parseSseBlocks('event: token\ndata: {"text":"hel', state);
    expect(first).toHaveLength(0);

    const second = parseSseBlocks('lo"}\n\nevent: done\ndata: {}\n\n', state);
    expect(second).toEqual([
      { event: "token", data: '{"text":"hello"}' },
      { event: "done", data: "{}" },
    ]);
  });

  it("parses blocks that omit explicit event name", () => {
    const state = { buffer: "" };
    const frames = parseSseBlocks('data: {"x":1}\n\n', state);
    expect(frames).toEqual([{ event: "message", data: '{"x":1}' }]);
  });

  it("supports CRLF-delimited SSE blocks", () => {
    const state = { buffer: "" };
    const frames = parseSseBlocks("event: done\r\ndata: {}\r\n\r\n", state);
    expect(frames).toEqual([{ event: "done", data: "{}" }]);
  });
});
