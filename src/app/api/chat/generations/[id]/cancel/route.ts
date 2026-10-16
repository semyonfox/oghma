// Hard cancel for a chat generation (the Stop button). Work no live worker owns
// (queued, or a generating row whose lease expired) is settled in PostgreSQL
// immediately. A running worker gets a Redis flag that its watchdog observes
// within one tick (~5s), aborting the LLM stream and persisting whatever
// partial answer already streamed.
import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  requireValidId,
  type RouteParamsContext,
  tracedError,
  withErrorHandler,
} from "@/lib/api-error";
import { checkRateLimit } from "@/lib/rate-limiter";
import {
  cancelChatGeneration,
  loadOwnedChatGeneration,
  requestChatGenerationCancel,
  revokeChatGeneration,
} from "@/lib/chat/generation-store";

export const POST = withErrorHandler(
  async (
    _request: NextRequest,
    { params }: RouteParamsContext<{ id: string }>,
  ) => {
    const session = await requireAuth();

    const limited = await checkRateLimit("chat-cancel", session.user_id);
    if (limited) return limited;

    const { id: rawId } = await params;
    const id = requireValidId(rawId, "generation id");

    const generation = await loadOwnedChatGeneration(id, session.user_id);
    if (!generation) return tracedError("Generation not found", 404);

    if (
      generation.status === "completed" ||
      generation.status === "cancelled" ||
      generation.status === "failed"
    ) {
      return NextResponse.json({ success: true, status: generation.status });
    }

    if (await cancelChatGeneration(id)) {
      return NextResponse.json({ success: true, status: "cancelled" });
    }

    try {
      await requestChatGenerationCancel(id);
    } catch {
      // without Redis the watchdog cannot see the flag, so revoke the lease
      // instead; the worker stops at its next heartbeat
      await revokeChatGeneration(id);
      return NextResponse.json({ success: true, status: "cancelled" });
    }
    return NextResponse.json({ success: true, status: "cancelling" });
  },
);
