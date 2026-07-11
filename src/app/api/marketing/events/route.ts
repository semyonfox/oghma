import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-error";
import {
  marketingEventResponse,
  recordMarketingEvent,
} from "@/lib/marketing/events";

export const POST = withErrorHandler(async (request: NextRequest) => {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > 8_192) return marketingEventResponse(false, 413);

  const rawBody = await request.text().catch(() => "");
  if (rawBody.length > 8_192) return marketingEventResponse(false, 413);
  const body = (() => {
    try {
      return JSON.parse(rawBody);
    } catch {
      return null;
    }
  })();
  if (!body || typeof body !== "object") {
    return marketingEventResponse(false, 400);
  }

  const ok = await recordMarketingEvent(body, request, { trusted: false });
  const optedOut = request.headers.get("dnt") === "1" || request.headers.get("sec-gpc") === "1";
  return marketingEventResponse(ok || optedOut, ok || optedOut ? 202 : 400);
});
