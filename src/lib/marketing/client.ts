"use client";

import { createTelemetrySender, telemetryEndpoint, telemetryEvent, type TelemetryObservation } from "@/lib/telemetry";

let forceDisabled = false;
const PREFERENCE_KEY = "oghma-telemetry-disabled";
export const TELEMETRY_PREFERENCE_EVENT = "oghma-telemetry-preference";

export function telemetryConfigured(): boolean {
  return process.env.NEXT_PUBLIC_TELEMETRY_ENABLED === "true" && telemetryEndpoint(process.env.NEXT_PUBLIC_TELEMETRY_ENDPOINT) !== null;
}

export function telemetryDisabled(): boolean {
  try { return forceDisabled || typeof window === "undefined" || window.localStorage.getItem(PREFERENCE_KEY) === "true"; }
  catch { return true; }
}

export function setTelemetryDisabled(disabled: boolean): boolean {
  forceDisabled = true;
  try {
    window.localStorage.setItem(PREFERENCE_KEY, String(disabled));
    forceDisabled = disabled;
    window.dispatchEvent(new Event(TELEMETRY_PREFERENCE_EVENT));
    return true;
  } catch { return false; }
}

export function marketingAnalyticsAllowed(): boolean {
  try {
    if (typeof window === "undefined" || typeof navigator === "undefined") return false;
    const gpc: unknown = Reflect.get(navigator, "globalPrivacyControl");
    const signals: unknown[] = [navigator.doNotTrack, Reflect.get(window, "doNotTrack")];
    return telemetryConfigured() && !telemetryDisabled() && gpc !== true && !signals.some((signal) => signal === "1" || signal === "yes");
  } catch { return false; }
}

const send = createTelemetrySender(() => ({
  enabled: telemetryConfigured(), endpoint: process.env.NEXT_PUBLIC_TELEMETRY_ENDPOINT, allowed: marketingAnalyticsAllowed(),
}));

export function reportTelemetry(observation: TelemetryObservation): void {
  try { void send(telemetryEvent(observation)); } catch { /* optional reporting never blocks a task */ }
}
