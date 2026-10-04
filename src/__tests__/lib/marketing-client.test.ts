// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  vi.stubEnv("NEXT_PUBLIC_TELEMETRY_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_TELEMETRY_ENDPOINT", "/api/marketing/events");
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 })));
});
afterEach(() => {
  for (const key of ["doNotTrack", "globalPrivacyControl"]) Reflect.deleteProperty(navigator, key);
  Reflect.deleteProperty(window, "doNotTrack");
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("anonymous browser privacy signals", () => {
  it.each(["1", "YES"])("honors navigator Do Not Track %s", async (value) => {
    Object.defineProperty(navigator, "doNotTrack", { configurable: true, value });
    const { reportTelemetry } = await import("@/lib/marketing/client");
    reportTelemetry({ kind: "count", name: "screen_view", route: "home" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("honors Global Privacy Control", async () => {
    Object.defineProperty(navigator, "globalPrivacyControl", { configurable: true, value: true });
    const { reportTelemetry } = await import("@/lib/marketing/client");
    reportTelemetry({ kind: "count", name: "screen_view", route: "home" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("honors the legacy window signal independently", async () => {
    Object.defineProperty(navigator, "doNotTrack", { configurable: true, value: "0" });
    Object.defineProperty(window, "doNotTrack", { configurable: true, value: "1" });
    const { reportTelemetry } = await import("@/lib/marketing/client");
    reportTelemetry({ kind: "count", name: "screen_view", route: "home" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
