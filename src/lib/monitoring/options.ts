import type { ClientOptions } from "@sentry/core";
import { privateDataCollection, sanitizeError, sanitizeSpan } from "./privacy";

export function monitoringOptions(
  service: "web" | "server" | "edge" | "worker",
) {
  return {
    dataCollection: privateDataCollection,
    maxBreadcrumbs: 0,
    beforeSend: sanitizeError,
    beforeSendSpan: sanitizeSpan,
    beforeSendLog: () => null,
    beforeSendMetric: () => null,
    tracePropagationTargets: [
      /^\/(?!\/)/,
      /^https:\/\/(dev\.)?oghmanotes\.ie(?:\/|$)/,
    ],
    strictTraceContinuation: true,
    initialScope: { tags: { service } },
    ignoreSpans: [{ name: /^(?:GET|HEAD) \/api\/health(?:\?|$)/ }],
  } satisfies Partial<ClientOptions>;
}

// prod reuses the image dev built, so the browser reads its environment from the
// host rather than the value baked in at build time
export function browserEnvironment(hostname: string): string | undefined {
  if (hostname === "dev.oghmanotes.ie") return "dev";
  if (hostname === "oghmanotes.ie" || hostname === "www.oghmanotes.ie")
    return "prod";
  return undefined;
}

export function traceSampleRate(value: string | undefined): number {
  if (value?.trim()) {
    const rate = Number(value);
    if (Number.isFinite(rate) && rate >= 0 && rate <= 1) return rate;
  }
  return process.env.NODE_ENV === "development" ? 1 : 0.1;
}
