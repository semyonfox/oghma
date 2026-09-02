# Chat operations

> **Status:** Active operations runbook
>
> **Last verified:** 2026-09-02 against the chat routes, BullMQ worker,
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

Both app and worker must use the same `DATABASE_URL`, `REDIS_HOST`,
`REDIS_PORT`, `REDIS_TLS`, and `QUEUE_PREFIX`. Background chat currently
requires `QUEUE_PROVIDER=bullmq`.

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
| Answer appears only after reload | Redis replay or stream completion failed after PostgreSQL persisted the answer |
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
one authenticated chat response without reloading, and the persisted response
after reloading. Promote through the normal `dev` to `main` pull request only
after those checks pass. Follow the homelab rollback procedure if any check
regresses.
