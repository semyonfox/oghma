import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-error";
import {
  marketingEventResponse,
  recordMarketingEvent,
} from "@/lib/marketing/events";

export const POST = withErrorHandler(async (request: NextRequest) => {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return marketingEventResponse(false, 400);
  }

  const ok = await recordMarketingEvent(body, request);
  return marketingEventResponse(ok, ok ? 202 : 400);
});
