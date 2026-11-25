// Server-sent change events for one tab. Each event names what changed, a
// tree branch, a study map or the import jobs, and the tab refetches it
// through the normal routes. Nothing here carries note content.
//
// The open stream is also the tab's chat presence: the worker cancels a
// generation only once no tab of the user has been present for a while, see
// src/lib/chat/presence.ts. The server refreshes presence on its own ping, so
// a quiet tab, hidden or not, sends no requests.
import { NextResponse } from "next/server";
import { withErrorHandler, requireAuth } from "@/lib/api-error";
import { isValidPresenceTabId, recordChatPresence, removeChatPresence } from "@/lib/chat/presence";
import logger from "@/lib/logger";
import { subscribeServerEvents } from "@/lib/server-events/hub";
import type { ServerEvent } from "@/lib/server-events/types";

export const dynamic = "force-dynamic";

// under nginx's 60s proxy_read_timeout for the app, and well under
// PRESENCE_STALE_MS so a live stream never looks absent
const PING_MS = 25_000;
// the session is checked once per stream, so streams end and reconnect with
// a fresh check. EventSource reconnects after the retry delay by itself, well
// inside the presence grace window
const MAX_STREAM_MS = 30 * 60_000;
const RETRY_MS = 5_000;

function format(event: ServerEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

// a dropped presence write is harmless: the next ping retries it, and a Redis
// outage also turns off disconnect cancellation in the worker
function presenceFailed(error: unknown): void {
  logger.warn("chat presence update failed", {
    error: error instanceof Error ? error.message : String(error),
  });
}

export const GET = withErrorHandler(async (request) => {
  const user = await requireAuth();
  const tab = request.nextUrl.searchParams.get("tab");
  const tabId = isValidPresenceTabId(tab) ? tab : null;
  const encoder = new TextEncoder();
  let push: (text: string) => void = () => {};
  // subscribe before the stream starts, so a LISTEN failure is a plain 500
  // and the browser falls back to polling instead of holding a dead stream
  const unsubscribe = await subscribeServerEvents(user.user_id, (event) => push(format(event)));
  let stop = unsubscribe;

  const markPresent = () => {
    if (tabId) void recordChatPresence(user.user_id, tabId).catch(presenceFailed);
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const ping = setInterval(() => {
        push(": ping\n\n");
        markPresent();
      }, PING_MS);
      const lifetime = setTimeout(() => stop(), MAX_STREAM_MS);
      stop = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        clearTimeout(lifetime);
        unsubscribe();
        request.signal.removeEventListener("abort", stop);
        // closing the tab ends the stream, which starts the worker's grace window
        if (tabId) void removeChatPresence(user.user_id, tabId).catch(presenceFailed);
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      };
      push = (text) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          stop();
        }
      };
      request.signal.addEventListener("abort", stop);
      markPresent();
      push(`retry: ${RETRY_MS}\n: connected\n\n`);
    },
    cancel() {
      stop();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
