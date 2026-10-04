import { createTelemetrySender, telemetryEndpoint } from "@/lib/telemetry";

export function telemetryServerConfigured(): boolean {
  return process.env.TELEMETRY_ENABLED === "true" && telemetryEndpoint(process.env.TELEMETRY_ENDPOINT)?.startsWith("https://") === true;
}

export const forwardTelemetry = createTelemetrySender(() => ({
  enabled: telemetryServerConfigured(), endpoint: process.env.TELEMETRY_ENDPOINT, allowed: true,
}), "proxy");
