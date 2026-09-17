import type { SseWriter } from "@/lib/chat/stream-events";
import { toSseEvent } from "@/lib/chat/sse";

const DELIVERY_INTERVAL_MS = 400;
const MAX_BUFFERED_CHARS = 24_000;

/**
 * Buffer presentation, not generation. Preserve every character and flush before
 * structural events so a tool cannot overtake the prose that introduced it.
 * Inspired by T3 Code's paragraph delivery; see docs/operations/chat.md.
 */
export function createParagraphSseWriter(sink: SseWriter) {
  const encoder = new TextEncoder();
  let kind: "token" | "thinking" | null = null;
  let buffer = "";
  let scanned = 0;
  let ready = 0;
  let fence: { char: string; length: number; indent: number } | null = null;
  let lastDelivery = -Infinity;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function clearTimer() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  function deliver(length: number) {
    clearTimer();
    if (!length || !kind) return;
    sink.enqueue(
      encoder.encode(toSseEvent(kind, { text: buffer.slice(0, length) })),
    );
    buffer = buffer.slice(length);
    scanned = Math.max(0, scanned - length);
    ready = 0;
    lastDelivery = Date.now();
  }

  function flushText() {
    deliver(buffer.length);
    clearTimer();
    scanned = 0;
    fence = null;
    kind = null;
  }

  function scan() {
    // Visit each completed line once. Incomplete lines remain in the buffer.
    for (;;) {
      const end = buffer.indexOf("\n", scanned);
      const line = buffer
        .slice(scanned, end < 0 ? undefined : end)
        .replace(/\r$/, "");
      if (
        !fence &&
        scanned > 0 &&
        /^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]/.test(line)
      ) {
        ready = scanned;
      }
      if (end < 0) return;
      const marker = /^( *)(`{3,}|~{3,})(.*)$/.exec(line);
      if (marker) {
        const indent = marker[1].length;
        const run = marker[2];
        if (!fence) {
          fence = { char: run[0], length: run.length, indent };
        } else if (
          run[0] === fence.char &&
          run.length >= fence.length &&
          indent <= fence.indent + 3 &&
          /^[ \t]*$/.test(marker[3])
        ) {
          fence = null;
          ready = end + 1;
        }
      } else if (!fence && /^[ \t]*$/.test(line) && scanned > 0) {
        ready = end + 1;
      }
      scanned = end + 1;
    }
  }

  return {
    enqueue(chunk: Uint8Array) {
      // Heartbeats may pass without exposing an unfinished paragraph.
      if (chunk[0] !== 58) flushText();
      sink.enqueue(chunk);
    },
    appendText(nextKind: "token" | "thinking", text: string) {
      if (kind !== nextKind) flushText();
      kind = nextKind;
      buffer += text;
      scan();
      if (buffer.length >= MAX_BUFFERED_CHARS) {
        // Keep fence state across the safety flush for a very long code block.
        deliver(buffer.length);
      } else if (ready) {
        const delay = DELIVERY_INTERVAL_MS - (Date.now() - lastDelivery);
        if (delay <= 0) deliver(ready);
        else if (timer === undefined)
          timer = setTimeout(() => deliver(ready), delay);
      }
    },
    flushText,
    close() {
      flushText();
      sink.close();
    },
    dispose() {
      clearTimer();
      buffer = "";
    },
  } satisfies SseWriter & { flushText(): void; dispose(): void };
}
