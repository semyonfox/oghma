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

export function traceSampleRate(value: string | undefined): number {
  if (value?.trim()) {
    const rate = Number(value);
    if (Number.isFinite(rate) && rate >= 0 && rate <= 1) return rate;
  }
  return process.env.NODE_ENV === "development" ? 1 : 0.1;
}
