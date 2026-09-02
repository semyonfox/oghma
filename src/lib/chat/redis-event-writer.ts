import type { SseWriter } from "@/lib/chat/stream-events";

export const DEFAULT_MAX_PENDING_CHAT_EVENTS = 256;

export interface BufferedSseWriter extends SseWriter {
  flush(): Promise<void>;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Serializes Redis Stream writes without letting a slow or failed Redis server
 * retain an unbounded number of token events in worker memory. Once delivery
 * is unavailable, the generation can still finish durably in PostgreSQL and
 * clients reconcile from that state.
 */
export function createBufferedSseWriter(
  append: (sse: string) => Promise<unknown>,
  maxPendingEvents = DEFAULT_MAX_PENDING_CHAT_EVENTS,
): BufferedSseWriter {
  const decoder = new TextDecoder();
  let pending = Promise.resolve();
  let pendingEvents = 0;
  let deliveryError: Error | null = null;
  let stopped = false;

  const failDelivery = (error: unknown): void => {
    if (!deliveryError) deliveryError = asError(error);
    stopped = true;
  };

  return {
    enqueue(chunk) {
      if (stopped) return;

      const sse = decoder.decode(chunk);
      if (sse.startsWith(":")) return;

      if (pendingEvents >= maxPendingEvents) {
        failDelivery(
          new Error(
            `Chat event delivery exceeded ${maxPendingEvents} pending Redis writes`,
          ),
        );
        return;
      }

      pendingEvents += 1;
      pending = pending
        .then(() => append(sse))
        .then(
          () => undefined,
          (error) => {
            failDelivery(error);
          },
        )
        .then(() => {
          pendingEvents -= 1;
        });
    },
    close() {},
    async flush() {
      await pending;
      if (deliveryError) throw deliveryError;
    },
  };
}
