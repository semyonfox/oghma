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
} from "@/lib/chat/generation-store";
import { toSseEvent } from "@/lib/chat/sse";

const encoder = new TextEncoder();
const REDIS_STREAM_ID = /^\d+-\d+$/;

function isTerminalEvent(sse: string): boolean {
  return /^event:\s*(?:done|error)\s*$/m.test(sse);
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

    return new NextResponse(
      new ReadableStream({
        start(controller) {
          void (async () => {
            let afterId = initialAfter;
            try {
              controller.enqueue(encoder.encode(": connected\n\n"));
              while (!cancelled) {
                const events = await readChatGenerationEvents(id, afterId);
                for (const event of events) {
                  afterId = event.id;
                  controller.enqueue(
                    encoder.encode(`id: ${event.id}\n${event.sse}`),
                  );
                }

                if (events.some((event) => isTerminalEvent(event.sse))) {
                  break;
                }

                const latest = await loadOwnedChatGeneration(id, user.user_id);
                if (
                  !latest ||
                  (events.length === 0 &&
                    (latest.status === "completed" || latest.status === "cancelled"))
                ) {
                  break;
                }
                if (latest.status === "failed" && events.length === 0) {
                  controller.enqueue(
                    encoder.encode(
                      toSseEvent("error", {
                        message: latest.error_message || "Failed to generate response",
                      }),
                    ),
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
            }
          })();
        },
        cancel() {
          cancelled = true;
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
