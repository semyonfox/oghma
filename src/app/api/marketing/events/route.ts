import { NextResponse } from "next/server";
import { forwardTelemetry, telemetryServerConfigured } from "@/lib/marketing/events";
import { hasPrivacySignal, parseTelemetryEvent } from "@/lib/telemetry";

export async function POST(request: Request): Promise<NextResponse> {
  if (!telemetryServerConfigured() || hasPrivacySignal(request)) return new NextResponse(null, { status: 204 });
  if (Number(request.headers.get("content-length")) > 1024) return new NextResponse(null, { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) return new NextResponse(null, { status: 400 });
  const timeout = setTimeout(() => { void reader.cancel().catch(() => {}); }, 2000);
  try {
    const decoder = new TextDecoder();
    let bytes = 0;
    let raw = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 1024) { await reader.cancel(); return new NextResponse(null, { status: 413 }); }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
    const body: unknown = JSON.parse(raw);
    const event = parseTelemetryEvent(body);
    if (!event) return new NextResponse(null, { status: 400 });
    await forwardTelemetry(event);
    return new NextResponse(null, { status: 204 });
  } catch { return new NextResponse(null, { status: 400 }); }
  finally { clearTimeout(timeout); reader.releaseLock(); }
}
