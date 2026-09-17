# Chat operations

> **Status:** Active operations runbook
>
> **Last verified:** 2026-09-14 against the chat routes, BullMQ worker,
> PostgreSQL generation state, and Redis replay implementation
>
> **Source of truth:** `src/app/api/chat/`, `src/lib/chat/`,
> `src/lib/queue.ts`, `src/lib/canvas/worker-entry.ts`, and
> `database/migrations/`

## Request and delivery path

The browser posts a message to `POST /api/chat`. The app persists the user
message and a queued generation in PostgreSQL, then publishes its ID to the
environment-prefixed BullMQ `chat-generation` queue. The Node worker calls the
LLM and appends ordered SSE events to a one-hour Redis Stream. It persists the
final assistant message and terminal generation status in PostgreSQL.

The browser reads `/api/chat/generations/{id}/stream` and reconnects with the
last Redis event ID when delivery breaks. PostgreSQL owns sessions, messages,
request payloads, and terminal state. Redis owns queue transport, short-lived
event replay, cancellation flags, and browser presence.

The client reconciles each completed generation with the saved session while
keeping message bubbles and work-log expansion mounted. Reconnects retain the
last event cursor. If replay has no completion event but PostgreSQL has settled
the generation, the stream route sends a terminal event so the client can read
the saved result without waiting through repeated empty replay attempts.

Chat does not run semantic search before calling the model. When note search is
enabled, the model decides whether to call `getChunks` or `readNote`. The
selected note and folder set remains the default session search scope passed to
the tools. Only model-requested tool calls appear as search activity in the
response work log.

Both app and worker must use the same `DATABASE_URL`, `REDIS_HOST`,
`REDIS_PORT`, `REDIS_TLS`, and `QUEUE_PREFIX`. Background chat currently
requires `QUEUE_PROVIDER=bullmq`.

## Streaming and restoration contract

Verified against the working tree on 2026-09-17. These changes require an app
and worker deployment; this section does not assert production rollout.

`generation-result.ts` records reasoning, prose, and tool calls in one ordered
`parts` array. Tool results update the matching call ID without moving its
position or replacing its input detail. The browser uses the same ordering.
Prose remains visible when a later tool arrives, and work-log groups retain
manual expansion state through final reconciliation. Only text after the last
reasoning/tool part qualifies as the final answer for copying and final-answer
synthesis. Earlier narration cannot satisfy a missing final answer.

`paragraph-stream.ts` buffers prose and reasoning before SSE/Redis delivery.
It emits finished paragraphs, closed fenced code blocks, and completed list
items. Deliveries are paced at 400 ms, with a timer to release a ready block
when the provider pauses. A 24,000-character safety limit bounds pending text.
Tool events, provider text/reasoning endings, completion, cancellation, and
errors flush the pending tail before proceeding. Generation itself still
consumes the provider's full stream.

This follows the paragraph-delivery approach inspected in
[T3 Code's ProviderRuntimeIngestion.ts at 0150c6a](https://github.com/pingdotgg/t3code/blob/0150c6a53b409ba3bcb45645709b649cf8708354/apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts).
OghmaNotes additionally tracks scanned lines incrementally and uses a delivery
timer, rather than waiting for another provider delta to release ready text.

A provider failure after output starts saves the partial message and failed
generation status atomically. The worker does not retry that generation and
repeat tools that may already have changed notes or calendar entries. Failures
before any output retain the existing bounded retry policy. Explicit stop saves
partial output as cancelled. A lost worker lease still fences all final writes.
Abrupt process death remains subject to the existing lease/requeue recovery;
this is not a checkpoint of model execution after every tool.

Transport reconnects resume after the last successfully parsed event ID.
Terminal generation errors are not reconnect attempts. A Redis append failure
stops subsequent queued writes, preventing a later `done` event from passing a
missing segment. PostgreSQL reconciliation supplies the saved message when
Redis delivery is unavailable.

Use `sql.json(value)` for parts, sources, and metadata. For an already serialized
payload, bind it as text before casting to JSONB. Binding `JSON.stringify(value)`
directly as JSONB lets postgres.js encode the string again. The reader accepts
legacy JSON strings, validates their decoded fields, and recovers the trace
without a data migration. Legacy aggregated reasoning has no original positions;
it appears before the stored parts. New messages preserve the actual positions.

Regression coverage includes `paragraph-stream.test.ts`,
`generate-background.test.ts`, `use-chat-stream.test.ts`, the real-driver
`tests/integration/db/chat-generation-json.test.ts`, and
`tests/e2e/smoke/chat-stream-order.spec.ts`.

## Readiness checks

The generic endpoint is an app and database liveness check. Redis degradation
does not change its HTTP 200 response:

```bash
curl -fsS http://127.0.0.1:3000/api/health
```

Use the stricter check for chat deployment and monitoring:

```bash
curl -fsS 'http://127.0.0.1:3000/api/health?readiness=chat'
npm run worker:healthcheck
```

Chat readiness requires PostgreSQL, Redis, and BullMQ. The worker check opens
the configured queues, including `chat-generation`, and reads their counts.
Neither check proves that the configured LLM will complete a request. Use the
disposable fake provider in CI and an authenticated test account in development
for that final check.

## Safe diagnosis

Start with bounded container logs and redact identifiers before sharing them:

```bash
docker logs oghma-dev --tail 100
docker logs oghma-dev-worker --tail 120
```

The worker logs completed, cancelled, and failed background generations with a
generation ID and elapsed time. The app logs Redis connection failures. Do not
copy request payloads, message content, environment files, or authenticated
URLs into an issue.

Use aggregate PostgreSQL state to detect a growing or stale generation cohort
without reading user prompts:

```sql
SELECT status,
       COUNT(*) AS generations,
       MIN(created_at) AS oldest_created_at,
       MAX(updated_at) AS newest_update_at
FROM app.chat_generations
GROUP BY status
ORDER BY status;
```

Run SQL and Redis commands only through the private operations workflow. Do not
change generation rows or delete queue keys during diagnosis.

## Symptom map

| Symptom | Check first |
|---|---|
| `POST /api/chat` does not return 202 | App logs, PostgreSQL, Redis, rate limiting, and queue prefix |
| Request is accepted but no events arrive | Worker process, worker health check, chat queue, and matching prefixes |
| Partial response stops | Worker generation failure and Redis connection logs |
| Answer appears only after reload | Client history restoration overwrote live messages, or terminal replay/session reconciliation failed |
| Session stays generating | Worker interruption, failed BullMQ redelivery, or stale PostgreSQL ownership |

## Release verification

Run the integration and browser suites against disposable services. Keep the
worker running with the same E2E environment as the app:

```bash
npm run e2e:services:up
npm run e2e:reset
npm run test:integration
# Second terminal
npm run e2e:worker
npm run e2e:smoke -- --workers=1
```

The chat smoke sends a real browser request through PostgreSQL, BullMQ, the Node
worker, the fake AI provider, Redis replay, and final persistence. It reloads
the session and checks that the answer remains present exactly once.

Deploy to `dev` first. Verify generic liveness, chat readiness, worker health,
one authenticated chat response and a follow-up without reloading, work-log
access after completion, and the persisted responses after reloading.
Promote through the normal `dev` to `main` pull request only
after those checks pass. Follow the homelab rollback procedure if any check
regresses.
