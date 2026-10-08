import * as Sentry from "@sentry/nextjs";
import { monitoringOptions, traceSampleRate } from "./lib/monitoring/options";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    ...monitoringOptions("web"),
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    tracesSampleRate: traceSampleRate(
      process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
    ),
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
