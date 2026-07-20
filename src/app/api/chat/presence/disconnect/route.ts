// Tab-close beacon. Fired via navigator.sendBeacon from `pagehide`, so the
// tab id travels as a query parameter and the body stays empty (beacons can't
// reliably set a JSON content type). Removing the tab's presence field starts
// the disconnect grace window for any in-flight chat generation.
import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler, requireAuthLite, tracedError } from "@/lib/api-error";
import { checkRateLimit } from "@/lib/rateLimiter";
import { isValidPresenceTabId, removeChatPresence } from "@/lib/chat/presence";
import logger from "@/lib/logger";

export const POST = withErrorHandler(async (request: NextRequest) => {
  // same token-only auth as the heartbeat — see presence/route.ts
  const session = await requireAuthLite();

  const limited = await checkRateLimit("chat-presence", session.user_id);
  if (limited) return limited;

  const tabId = request.nextUrl.searchParams.get("tab");
  if (!isValidPresenceTabId(tabId)) {
    return tracedError("Invalid tab id", 400);
  }

  try {
    await removeChatPresence(session.user_id, tabId);
  } catch (err) {
    // Missing the beacon only means the stale-presence fallback (~90s)
    // cancels instead of the fast path — never fail the unload request.
    logger.warn("chat presence disconnect failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({ success: true });
});
