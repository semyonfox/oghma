import * as Sentry from "@sentry/nextjs";
import { monitoringOptions, traceSampleRate } from "./lib/monitoring/options";

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    ...monitoringOptions("server"),
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: traceSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE),
  });
}
