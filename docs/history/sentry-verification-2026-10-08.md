# Sentry local verification — October 8, 2026

This records local verification, not production deployment. The current configuration is documented in the [monitoring runbook](../operations/monitoring.md).

The production-mode Next.js standalone server ran on loopback with synthetic database settings. Temporary browser and API error routes exercised the normal SDK startup hooks. Source maps were uploaded before the fresh errors were generated, then removed from the browser build output.

| Runtime | Sentry evidence                                                                                              | Result                                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Browser | [OGHMA-4](https://semyon-g7.sentry.io/issues/OGHMA-4)                                                        | Original `src/app/sentry-check/page.tsx:5` frame and source context                                                        |
| Server  | [OGHMA-5](https://semyon-g7.sentry.io/issues/OGHMA-5)                                                        | Original `src/app/api/sentry-check/route.ts:2` frame and source context                                                    |
| Worker  | [OGHMA-3](https://semyon-g7.sentry.io/issues/OGHMA-3)                                                        | An uncaught startup error reached Sentry with a readable `worker-entry.ts` frame through the actual worker preload command |
| Tracing | [Browser-to-server trace](https://semyon-g7.sentry.io/explore/traces/trace/af961d05e72b4a66b30542eb5589a1a8) | Page load, web vital, browser request and server request durations arrived                                                 |

Authenticated Sentry MCP readback confirmed the errors, frames and timings. The first events revealed inferred geographic data despite `dataCollection.userInfo: false`; the outgoing dummy-IP override removed that data from the fresh browser and server events. Earlier test issues retain the earlier payloads. No real notes or production jobs were used.

The temporary routes and worker throw were removed afterward. The production build, targeted lint and 64 tests passed. Tests cover outgoing privacy filters, sampling bounds, caught-operation reporting, unchanged error propagation and existing logger/classification/worker behavior.

A follow-up review found discarded worker exceptions and partial chat failures reported as successful processing spans. The handlers now preserve original exceptions, and genuine chat failures explicitly mark the active span as an error. All 69 targeted tests, type checking and targeted lint passed after the fix. A regression test exercises the real chat processor, logger and Sentry SDK with an in-memory transport: partial output stays saved, tools are not rerun, the original exception type and stack survive redaction, and the outgoing span reports an error. Separate checks preserve cancellation and retry behavior. This follow-up has not been verified against production traffic.

Production still needs its runtime DSN, public build DSN, masked Jenkins upload credential and approved deployment. The separate live Jenkins pipeline must receive the same build settings as the repository Jenkinsfile. Edge-specific delivery and real production ingestion have not been verified.
