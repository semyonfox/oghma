import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  requireValidId,
  tracedError,
  withErrorHandler,
} from "@/lib/api-error";
import {
  loadOwnedChatGeneration,
  readChatGenerationEvents,
  type ChatGenerationRecord,
} from "@/lib/chat/generation-store";
import {
  createBlockingRedisConnection,
  type RedisConnection,
} from "@/lib/redis";
import { toSseEvent } from "@/lib/chat/sse";

const encoder = new TextEncoder();
const REDIS_STREAM_ID = /^\d+-\d+$/;
const ACTIVE_READ_BLOCK_MS = 15_000;
// Redis treats BLOCK 0 as an indefinite wait. One millisecond gives terminal
// generations an effectively non-blocking pass to drain any remaining replay.
const TERMINAL_READ_BLOCK_MS = 1;

function isTerminalEvent(sse: string): boolean {
  return /^event:\s*(?:done|error)\s*$/m.test(sse);
}

function isDurablyTerminal(generation: ChatGenerationRecord): boolean {
  return (
    generation.status === "completed" ||
    generation.status === "cancelled" ||
    generation.status === "failed"
  );
}

function durableTerminalEvent(generation: ChatGenerationRecord): string {
  if (generation.status === "failed") {
    return toSseEvent("error", {
      message: generation.error_message || "Failed to generate response",
    });
  }
  return toSseEvent("done", {});
}

export const GET = withErrorHandler(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const user = await requireAuth();
    const { id: rawId } = await params;
    const id = requireValidId(rawId, "generation id");

    const generation = await loadOwnedChatGeneration(id, user.user_id);
    if (!generation) return tracedError("Generation not found", 404);

    const requestedAfter =
      request.headers.get("last-event-id") ?? request.nextUrl.searchParams.get("after");
    const initialAfter =
      requestedAfter && REDIS_STREAM_ID.test(requestedAfter) ? requestedAfter : "0-0";
    let cancelled = false;
    let reader: RedisConnection | null = null;

    return new NextResponse(
      new ReadableStream({
        start(controller) {
          void (async () => {
            let afterId = initialAfter;
            let latest = generation;
            try {
              reader = createBlockingRedisConnection();
              controller.enqueue(encoder.encode(": connected\n\n"));
              while (!cancelled) {
                const events = await readChatGenerationEvents(
                  id,
                  afterId,
                  isDurablyTerminal(latest)
                    ? TERMINAL_READ_BLOCK_MS
                    : ACTIVE_READ_BLOCK_MS,
                  reader,
                );
                for (const event of events) {
                  afterId = event.id;
                  controller.enqueue(
                    encoder.encode(`id: ${event.id}\n${event.sse}`),
                  );
                }

                if (events.some((event) => isTerminalEvent(event.sse))) {
                  break;
                }

                const refreshed = await loadOwnedChatGeneration(id, user.user_id);
                if (!refreshed) {
                  break;
                }
                latest = refreshed;

                if (events.length === 0 && isDurablyTerminal(latest)) {
                  controller.enqueue(
                    encoder.encode(durableTerminalEvent(latest)),
                  );
                  break;
                }
                if (events.length === 0) {
                  controller.enqueue(encoder.encode(": heartbeat\n\n"));
                }
              }
              if (!cancelled) controller.close();
            } catch (error) {
              if (!cancelled) controller.error(error);
            } finally {
              reader?.disconnect(false);
              reader = null;
            }
          })();
        },
        cancel() {
          cancelled = true;
          reader?.disconnect(false);
          reader = null;
        },
      }),
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      },
    );
  },
);
