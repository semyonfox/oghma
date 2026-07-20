// Tab presence heartbeat. Every open app tab reports itself every ~10s so the
// chat worker can tell a real disconnect (tab closed) apart from in-app
// navigation. Losing a heartbeat is never an error worth failing loudly for.
import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler, requireAuthLite, tracedError } from "@/lib/api-error";
import { checkRateLimit } from "@/lib/rateLimiter";
import { parseJsonBody } from "@/lib/auth";
import { isValidPresenceTabId, recordChatPresence } from "@/lib/chat/presence";
import logger from "@/lib/logger";

export const POST = withErrorHandler(async (request: NextRequest) => {
  // token-only auth: heartbeats fire every ~10s per tab, so they must not
  // cost a Postgres session lookup each — presence is low-stakes by design
  const session = await requireAuthLite();

  const limited = await checkRateLimit("chat-presence", session.user_id);
  if (limited) return limited;

  const { data, error } = await parseJsonBody(request);
  if (error) return error;
  if (!isValidPresenceTabId(data?.tabId)) {
    return tracedError("Invalid tabId", 400);
  }

  let recorded = true;
  try {
    await recordChatPresence(session.user_id, data.tabId);
  } catch (err) {
    // Redis being unavailable also disables disconnect-cancel in the worker,
    // so a dropped heartbeat is harmless — don't surface it to the client.
    recorded = false;
    logger.warn("chat presence heartbeat failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({ success: true, recorded });
});
