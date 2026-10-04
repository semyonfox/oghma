// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => { vi.resetModules(); localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("browser telemetry privacy", () => {
  it("emits nothing by default or with only an enable flag", async () => {
    vi.stubEnv("NEXT_PUBLIC_TELEMETRY_ENABLED", "false");
    vi.stubEnv("NEXT_PUBLIC_TELEMETRY_ENDPOINT", "");
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const client = await import("@/lib/marketing/client");
    client.reportTelemetry({ kind: "count", name: "screen_view", route: "editor" });
    vi.stubEnv("NEXT_PUBLIC_TELEMETRY_ENABLED", "true");
    client.reportTelemetry({ kind: "error", name: "request_failed", route: "search" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("honors browser signals, local opt-out and inaccessible storage", async () => {
    vi.stubEnv("NEXT_PUBLIC_TELEMETRY_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_TELEMETRY_ENDPOINT", "/api/marketing/events");
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const client = await import("@/lib/marketing/client");
    for (const navigator of [{ doNotTrack: "1" }, { doNotTrack: "yes" }, { globalPrivacyControl: true }]) {
      vi.stubGlobal("navigator", navigator);
      client.reportTelemetry({ kind: "count", name: "screen_view", route: "editor" });
    }
    vi.unstubAllGlobals(); vi.stubGlobal("fetch", fetch);
    client.setTelemetryDisabled(true);
    client.reportTelemetry({ kind: "count", name: "screen_view", route: "editor" });
    expect(localStorage.getItem("oghma-telemetry-disabled")).toBe("true");
    expect(fetch).not.toHaveBeenCalled();
    client.setTelemetryDisabled(false);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    client.reportTelemetry({ kind: "count", name: "screen_view", route: "editor" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("honors an opt-out from either DNT source when their values conflict", async () => {
    vi.stubEnv("NEXT_PUBLIC_TELEMETRY_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_TELEMETRY_ENDPOINT", "/api/marketing/events");
    vi.stubGlobal("navigator", { doNotTrack: "0" });
    vi.stubGlobal("doNotTrack", "1");
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const client = await import("@/lib/marketing/client");
    client.reportTelemetry({ kind: "count", name: "screen_view", route: "login" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("offers a named keyboard-operable preference and reports failed storage safely", async () => {
    vi.stubEnv("NEXT_PUBLIC_TELEMETRY_ENABLED", "false");
    const { default: Preference } = await import("@/components/telemetry-preference");
    render(<Preference />);
    const checkbox = screen.getByRole("checkbox", { name: "Disable anonymous usage counts" });
    checkbox.focus(); expect(document.activeElement).toBe(checkbox);
    fireEvent.click(checkbox); expect(localStorage.getItem("oghma-telemetry-disabled")).toBe("true");
    expect(screen.getByRole("status").textContent).toContain("off because no endpoint");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage blocked"); });
    expect(() => fireEvent.click(checkbox)).not.toThrow();
    expect(screen.getByRole("status").textContent).toContain("could not save");
  });
});
