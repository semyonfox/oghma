import { afterEach, describe, expect, it, vi } from "vitest";
import { createTelemetrySender, hasPrivacySignal, parseTelemetryEvent, telemetryEndpoint, telemetryEvent } from "@/lib/telemetry";
import { POST } from "@/app/api/marketing/events/route";

const event = telemetryEvent({ kind: "count", name: "screen_view", route: "editor" });
const configuration = () => ({ enabled: true, endpoint: "https://collector.example.test/v1/events", allowed: true });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("anonymous telemetry contract", () => {
  it("requires exactly six allowlisted fields, including matching kind and name", () => {
    expect(parseTelemetryEvent(event)).toEqual(event);
    for (const extra of ["userId", "path", "properties", "referrer", "timestamp", "stack"]) {
      expect(parseTelemetryEvent({ ...event, [extra]: "private fixture" })).toBeNull();
    }
    expect(parseTelemetryEvent({ ...event, route: "/notes/private-id?token=secret" })).toBeNull();
    expect(parseTelemetryEvent({ ...event, kind: "error" })).toBeNull();
    expect(parseTelemetryEvent(new Error("private fixture"))).toBeNull();
    expect(parseTelemetryEvent({ ...event, get route() { throw new Error("private fixture"); } })).toBeNull();
  });
  it("rejects unsafe or unconfigured endpoints", () => {
    for (const value of [undefined, "", "http://collector.example.test/v1/events", "//elsewhere.test", "https://user:secret@example.test", "/events?note=private", "https://example.test/events#private"]) expect(telemetryEndpoint(value)).toBeNull();
    expect(telemetryEndpoint("/api/marketing/events")).toBe("/api/marketing/events");
    expect(telemetryEndpoint(configuration().endpoint)).toBe(configuration().endpoint);
  });
  it("emits nothing without both configuration and permission", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    for (const config of [{ enabled: false, endpoint: configuration().endpoint, allowed: true }, { enabled: true, allowed: true }, { ...configuration(), allowed: false }]) {
      expect(await createTelemetrySender(() => config)(event)).toBe(false);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it("sends only approved categories without credentials, referrers or redirects", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 })); vi.stubGlobal("fetch", fetch);
    expect(await createTelemetrySender(configuration)(event)).toBe(true);
    const options: RequestInit = fetch.mock.calls[0][1];
    expect(JSON.parse(String(options.body))).toEqual(event);
    expect(Object.keys(JSON.parse(String(options.body)))).toHaveLength(6);
    expect(options).toMatchObject({ credentials: "omit", referrerPolicy: "no-referrer", redirect: "error" });
    expect(String(options.body)).not.toMatch(/private|userId|referrer|timestamp|path|properties/);
  });
  it("caps counts per minute and per app lifetime", async () => {
    vi.useFakeTimers(); vi.setSystemTime(0);
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 })); vi.stubGlobal("fetch", fetch);
    const send = createTelemetrySender(configuration);
    for (let minute = 0; minute < 10; minute++) {
      for (let i = 0; i < 20; i++) expect(await send(event)).toBe(true);
      expect(await send(event)).toBe(false);
      vi.setSystemTime((minute + 1) * 60_000);
    }
    expect(await send(event)).toBe(false); expect(fetch).toHaveBeenCalledTimes(200);
  });
  it("deduplicates error categories for a minute and never retries failures", async () => {
    vi.useFakeTimers(); vi.setSystemTime(0);
    const fetch = vi.fn().mockRejectedValue(new Error("private note /notes/private-id")); vi.stubGlobal("fetch", fetch);
    const send = createTelemetrySender(configuration);
    const error = telemetryEvent({ kind: "error", name: "request_failed", route: "search" });
    expect(await send(error)).toBe(false); expect(await send(error)).toBe(false); expect(fetch).toHaveBeenCalledTimes(1);
    vi.setSystemTime(60_000); expect(await send(error)).toBe(false); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("keeps proxy forwarding available after two hundred attempts in later windows", async () => {
    vi.useFakeTimers(); vi.setSystemTime(0);
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 })); vi.stubGlobal("fetch", fetch);
    const send = createTelemetrySender(configuration, "proxy");
    for (let minute = 0; minute < 11; minute++) {
      vi.setSystemTime(minute * 60_000);
      for (let i = 0; i < 20; i++) expect(await send(event)).toBe(true);
      expect(await send(event)).toBe(false);
    }
    vi.setSystemTime(11 * 60_000);
    const error = telemetryEvent({ kind: "error", name: "request_failed", route: "search" });
    expect(await send(error)).toBe(true); expect(await send(error)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(222);
  });
  it("allows one in-flight request and aborts after two seconds", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    })); vi.stubGlobal("fetch", fetch);
    const send = createTelemetrySender(configuration);
    const pending = send(event); expect(await send(event)).toBe(false);
    await vi.advanceTimersByTimeAsync(2000); expect(await pending).toBe(false); expect(fetch).toHaveBeenCalledTimes(1);
  });
});
describe("retired ingestion boundary", () => {
  it("does not read bodies or send requests in disabled mode", async () => {
    vi.stubEnv("TELEMETRY_ENABLED", "false");
    const request = new Request("https://app.example.test/api/marketing/events", { method: "POST", body: "private fixture" });
    const getReader = vi.spyOn(request.body!, "getReader"); const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect((await POST(request)).status).toBe(204); expect(getReader).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects privacy signals before reading a payload", async () => {
    vi.stubEnv("TELEMETRY_ENABLED", "true"); vi.stubEnv("TELEMETRY_ENDPOINT", configuration().endpoint);
    const signals: HeadersInit[] = [{ "Sec-GPC": "1" }, { DNT: "1" }, { DNT: "yes" }];
    for (const headers of signals) {
      const request = new Request("https://app.example.test/api/marketing/events", { method: "POST", body: "private fixture", headers });
      expect(hasPrivacySignal(request)).toBe(true); expect((await POST(request)).status).toBe(204);
    }
  });
  it("rejects legacy account-linked payloads and oversized streams", async () => {
    vi.stubEnv("TELEMETRY_ENABLED", "true"); vi.stubEnv("TELEMETRY_ENDPOINT", configuration().endpoint);
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const request = (body: string) => new Request("https://app.example.test/api/marketing/events", { method: "POST", body });
    expect((await POST(request(JSON.stringify({ eventName: "email_verified", userId: "private-id", occurred_at: Date.now() })))).status).toBe(400);
    expect((await POST(request("x".repeat(1025)))).status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });
});
