import * as Sentry from "@sentry/nextjs";
import { monitoringOptions, traceSampleRate } from "./lib/monitoring/options";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    ...monitoringOptions("edge"),
    dsn,
    // the deploy sets SENTRY_ENVIRONMENT at runtime, the public value is a build-time fallback
    environment:
      process.env.SENTRY_ENVIRONMENT ??
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
      process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    tracesSampleRate: traceSampleRate(
      process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
    ),
  });
}
