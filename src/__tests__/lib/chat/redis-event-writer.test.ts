import { describe, expect, it, vi } from "vitest";
import {
  createBufferedSseWriter,
} from "@/lib/chat/redis-event-writer";

const encoder = new TextEncoder();

describe("buffered Redis chat event writer", () => {
  it("serializes event writes and ignores SSE comments", async () => {
    const append = vi.fn(async () => undefined);
    const writer = createBufferedSseWriter(append);

    writer.enqueue(encoder.encode(": connected\n\n"));
    writer.enqueue(encoder.encode('event: token\ndata: {"text":"one"}\n\n'));
    writer.enqueue(encoder.encode('event: token\ndata: {"text":"two"}\n\n'));
    await writer.flush();

    expect(append).toHaveBeenCalledTimes(2);
    expect(append).toHaveBeenNthCalledWith(
      1,
      'event: token\ndata: {"text":"one"}\n\n',
    );
    expect(append).toHaveBeenNthCalledWith(
      2,
      'event: token\ndata: {"text":"two"}\n\n',
    );
  });

  it("stops accepting events after a Redis write fails", async () => {
    const append = vi.fn().mockRejectedValue(new Error("Redis unavailable"));
    const writer = createBufferedSseWriter(append);

    writer.enqueue(encoder.encode('event: token\ndata: {"text":"one"}\n\n'));
    await expect(writer.flush()).rejects.toThrow("Redis unavailable");

    writer.enqueue(encoder.encode('event: token\ndata: {"text":"two"}\n\n'));
    await expect(writer.flush()).rejects.toThrow("Redis unavailable");
    expect(append).toHaveBeenCalledTimes(1);
  });

  it("bounds pending Redis writes", async () => {
    let resolveAppend: (() => void) | undefined;
    const append = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveAppend = resolve;
        }),
    );
    const writer = createBufferedSseWriter(append, 1);

    writer.enqueue(encoder.encode('event: token\ndata: {"text":"one"}\n\n'));
    await Promise.resolve();
    writer.enqueue(encoder.encode('event: token\ndata: {"text":"two"}\n\n'));
    resolveAppend?.();

    await expect(writer.flush()).rejects.toThrow("exceeded 1 pending Redis writes");
    expect(append).toHaveBeenCalledTimes(1);
  });
});
