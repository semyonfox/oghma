// Hard cancel for a chat generation (the Stop button). Queued generations are
// cancelled immediately; running ones get a Redis flag that the worker
// watchdog observes within one tick (~5s), aborting the LLM stream and
// persisting whatever partial answer already streamed.
import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler, requireAuth, tracedError } from "@/lib/api-error";
import { checkRateLimit } from "@/lib/rateLimiter";
import { isValidUUID } from "@/lib/utils/uuid";
import {
  cancelChatGeneration,
  loadOwnedChatGeneration,
  requestChatGenerationCancel,
} from "@/lib/chat/generation-store";

export const POST = withErrorHandler(
  async (
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const session = await requireAuth();

    const limited = await checkRateLimit("chat-cancel", session.user_id);
    if (limited) return limited;

    const { id } = await params;
    if (!isValidUUID(id)) return tracedError("Invalid generation id", 400);

    const generation = await loadOwnedChatGeneration(id, session.user_id);
    if (!generation) return tracedError("Generation not found", 404);

    if (generation.status === "completed" || generation.status === "cancelled") {
      return NextResponse.json({ success: true, status: generation.status });
    }

    await requestChatGenerationCancel(id);

    if (generation.status === "queued") {
      // not claimed by the worker yet — settle it right now
      await cancelChatGeneration(id);
      return NextResponse.json({ success: true, status: "cancelled" });
    }

    return NextResponse.json({ success: true, status: "cancelling" });
  },
);
