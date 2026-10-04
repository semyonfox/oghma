import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createParagraphSseWriter } from "@/lib/chat/paragraph-stream";
import {
  sendToken,
  sendThinking,
  sendToolCall,
  sendDone,
  sendError,
} from "@/lib/chat/stream-events";
import { parseSseBlocks } from "@/lib/chat/sse";

function setup() {
  const chunks: string[] = [];
  const writer = createParagraphSseWriter({
    enqueue: (chunk) => {
      chunks.push(new TextDecoder().decode(chunk));
    },
    close: vi.fn(),
  });
  const frames = () => parseSseBlocks(chunks.join(""), { buffer: "" });
  const texts = () =>
    frames()
      .map((frame) => JSON.parse(frame.data).text)
      .filter(Boolean);
  return { writer, frames, texts };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("paragraph stream delivery", () => {
  it("sends complete paragraphs, paces bursts, and flushes the final tail", () => {
    const { writer, texts, frames } = setup();
    sendToken(writer, "First ");
    expect(texts()).toEqual([]);
    sendToken(writer, "paragraph.\n\nSecond");
    expect(texts()).toEqual(["First paragraph.\n\n"]);
    sendToken(writer, " paragraph.\n\nTail");
    expect(texts()).toHaveLength(1);
    vi.advanceTimersByTime(400);
    expect(texts()).toEqual(["First paragraph.\n\n", "Second paragraph.\n\n"]);
    sendDone(writer);
    expect(texts().join("")).toBe(
      "First paragraph.\n\nSecond paragraph.\n\nTail",
    );
    expect(frames().at(-1)?.event).toBe("done");
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["```", "~~~~"])(
    "keeps blank lines within a %s fenced block buffered",
    (fence) => {
      const { writer, texts } = setup();
      sendToken(writer, `${fence}ts\nconst a = 1;\n\nconst b = 2;\n`);
      expect(texts()).toEqual([]);
      sendToken(writer, `${fence}\nTail`);
      expect(texts()).toEqual([
        `${fence}ts\nconst a = 1;\n\nconst b = 2;\n${fence}\n`,
      ]);
      writer.close();
      expect(texts().at(-1)).toBe("Tail");
    },
  );

  it("delivers tight list items when the next item starts, including split markers", () => {
    const { writer, texts } = setup();
    sendToken(writer, "- One\n-");
    expect(texts()).toEqual([]);
    sendToken(writer, " Two\n- Three");
    expect(texts()).toEqual(["- One\n- Two\n"]);
    sendDone(writer);
    expect(texts().join("")).toBe("- One\n- Two\n- Three");
  });

  it("flushes reasoning and prose before tools and errors without reordering", () => {
    const { writer, frames, texts } = setup();
    sendThinking(writer, "Thinking first");
    sendToken(writer, "I'll read it");
    sendToolCall(writer, "readNote", "read-1");
    sendThinking(writer, "Thinking after tool");
    sendToken(writer, "Partial answer");
    sendError(writer, "Interrupted");
    expect(frames().map((frame) => frame.event)).toEqual([
      "thinking",
      "token",
      "tool-call",
      "thinking",
      "token",
      "error",
    ]);
    expect(texts()).toEqual([
      "Thinking first",
      "I'll read it",
      "Thinking after tool",
      "Partial answer",
    ]);
  });

  it("bounds unbroken output and disposes pending timers on loss of ownership", () => {
    const { writer, texts } = setup();
    sendToken(writer, "x".repeat(24_000));
    expect(texts()).toEqual(["x".repeat(24_000)]);
    sendToken(writer, "Next\n\n");
    expect(vi.getTimerCount()).toBe(1);
    writer.dispose();
    vi.advanceTimersByTime(1000);
    expect(texts()).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("produces identical text for every byte-sized provider chunk and CRLF boundaries", () => {
    const { writer, texts } = setup();
    const source =
      "Hello 🌊\r\n\r\n```js\r\n\r\nconst x = 1;\r\n```\r\n\r\n- One\r\n- Two\r\nEnd";
    for (const char of source) sendToken(writer, char);
    sendDone(writer);
    expect(texts().join("")).toBe(source);
  });
});
