import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { withErrorHandler, tracedError } from "@/lib/api-error";
import { isValidUUID } from "@/lib/utils/uuid";
import {
  loadOwnedChatGeneration,
  readChatGenerationEvents,
} from "@/lib/chat/generation-store";
import { toSseEvent } from "@/lib/chat/sse";

const encoder = new TextEncoder();
const REDIS_STREAM_ID = /^\d+-\d+$/;

export const GET = withErrorHandler(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const user = await validateSession();
    if (!user) return tracedError("Unauthorized", 401);
    const { id } = await params;
    if (!isValidUUID(id)) return tracedError("Invalid generation id", 400);

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

                const latest = await loadOwnedChatGeneration(id, user.user_id);
                if (!latest || latest.status === "completed" || latest.status === "cancelled") {
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
