import * as Sentry from "@sentry/node";
import { monitoringOptions, traceSampleRate } from "./options";

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    ...monitoringOptions("worker"),
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: traceSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE),
  });
}
