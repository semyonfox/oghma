# Current Homelab Runtime

> Status: Active current-state runbook
>
> Audience: Deployment operators and application maintainers
>
> Last verified: 2026-07-11 against `AGENTS.md`, `Jenkinsfile`, and runtime paths

Production and development currently run as Docker containers on the homelab
behind Cloudflare tunnels. This file describes what runs now. Future provider
choices belong in [TARGET_HOSTING.md](TARGET_HOSTING.md).

## Source-of-Truth Paths

Persistent services:

```text
/home/semyon/server-stacks/oghma/
  stack.yaml
  stack.env
  .env.dev
  .env.prod
  cloudflared-config.yml
  nginx/
```

Jenkins runtime environments for both the app and worker:

```text
/home/semyon/jenkins/env/oghma-dev.env
/home/semyon/jenkins/env/oghma-prod.env
```

The Jenkins env files are the deploy inputs. Do not copy their values into this
repository. Follow [the secrets policy](../docs/operations/secrets.md).

The root `docker-compose.yml` is a repository convenience for the development
app/worker/Qdrant shape; it is not the persistent homelab stack definition.

## Running Services

| Container | Ownership | Role |
|---|---|---|
| `oghma-postgres` | Persistent stack | PostgreSQL 17 application databases |
| `oghma-redis` | Persistent stack | BullMQ, resumable chat replay, cache, and rate limiting |
| `oghma-rustfs` | Persistent stack | S3-compatible object storage |
| `oghma-nginx` | Persistent stack | Routes production and development app traffic |
| `oghma-cloudflared-prod` | Persistent stack | Tunnel for `oghmanotes.ie` |
| `oghma-cloudflared-dev` | Persistent stack | Tunnel for `dev.oghmanotes.ie` |
| `oghma-qdrant` | Ensured by Jenkins | Vector storage with a persistent Docker volume |
| `oghma-prod` / `oghma-dev` | Replaced by Jenkins | Next.js app |
| `oghma-prod-worker` / `oghma-dev-worker` | Replaced by Jenkins | Long-running Node chat/import/vault worker |

Jenkins injects separate Qdrant collections:

- production: `oghma_prod_chunks`;
- development: `oghma_dev_chunks`.

Production and development share the persistent PostgreSQL, Redis, RustFS, and
Qdrant services but use separate databases, queue prefixes, storage naming,
and vector collections. A runaway development workload can still degrade
production. Treat that as an interim accepted risk, not strong isolation.

## Branch and Job Mapping

| Branch | Jenkins job | Environment | Public URL |
|---|---|---|---|
| `dev` | `oghma-dev` | Development | `https://dev.oghmanotes.ie` |
| `main` | `oghma-prod` | Production | `https://oghmanotes.ie` |

Changes flow from `dev` to `main` through a pull request. Do not push directly
to `main`.

GitHub webhooks target the Jenkins GitHub webhook endpoint recorded in
`AGENTS.md`.

## Jenkins Deployment

The current pipeline performs the same guarded candidate flow for both
environments:

1. Reject branches other than `dev` and `main`.
2. Build app and worker images in parallel.
3. Run the disposable E2E smoke suite.
4. Ensure `oghma-qdrant` and its persistent volume are available.
5. Run `node scripts/prebuild-migrate.mjs` in the app image using
   `MIGRATION_DATABASE_URL`.
6. Drain pending extraction retries with the worker image.
7. Start an app candidate named with the Jenkins build number and verify its
   health.
8. Rename the current app to a build-specific `previous` container, start the
   final fixed-name/fixed-IP app, and verify health. Restore `previous` if the
   final app fails.
9. Repeat the candidate/previous health flow for the worker, including
   `npm run worker:healthcheck`.
10. Run the public live smoke test.
11. Remove candidate/previous containers after success and retain the three
    most recent tagged images per app/worker repository and environment.

The candidate container proves that the image can start before the fixed
runtime is replaced. There is still a short swap window; do not describe it as
universally zero-downtime.

Migrations are recorded in `app.schema_migrations`. Never edit that table by
hand as a normal rollback mechanism.

## Queues

The current homelab provider is BullMQ on `oghma-redis:6379`.
`src/lib/queue.ts` applies an environment prefix. Exact queue names, job lanes,
and tuning values are owned by the
[import worker runbook](../docs/operations/import-worker.md).

The same persistent Redis instance carries the environment-prefixed
`chat-generation` queue and bounded, one-hour Redis Streams used to replay
missed SSE events after browser navigation. PostgreSQL remains authoritative
for generation status and completed chat messages.

The consumer is `src/lib/canvas/worker-entry.ts`. Producers use the queue
facade in `src/lib/queue.ts`; they should not depend directly on BullMQ.

Cloudflare Queues support is a provider option in code, not the current
homelab default.

## Read-Only Checks

```bash
docker ps --filter name=oghma
docker logs oghma-prod --tail 100
docker logs oghma-prod-worker --tail 120
docker logs oghma-dev --tail 100
docker logs oghma-dev-worker --tail 120
docker logs oghma-cloudflared-prod --tail 100
```

Logs may contain user identifiers, private object paths, or authenticated URLs
if another code path logged them incorrectly. Redact before sharing output.

Bounded database and queue health checks:

```bash
docker exec oghma-postgres psql -U oghma_admin oghma -c 'SELECT 1;'
docker exec oghma-redis redis-cli PING
```

Interactive `psql` and `redis-cli` sessions are privileged mutation surfaces,
not read-only checks. Use them only through the private operations workflow.
Do not include env-file contents in diagnostics.

## Rate-limiter degradation

`GET /api/health` is the app liveness check: it remains HTTP 200 while the
database is reachable, including when Redis is unavailable, but returns
`{"status":"degraded"}` in that case. Monitoring authenticated with
`x-health-secret: $HEALTH_CHECK_SECRET` also receives
`rateLimiter.redisReady` and `rateLimiter.status`. Alert on a degraded status
or `redisReady: false`; do not treat a successful container liveness check as
proof of distributed rate limiting.

In homelab and launch-provider deployments, Redis loss makes sensitive public
auth categories fail closed with HTTP 503 rather than use per-process memory
fallbacks. Other categories may retain the memory fallback to keep authenticated
product traffic available. Local development follows the same code path; run
Redis when validating shared rate limits, or expect sensitive auth flows to
return 503.

## Failure and Rollback Boundary

During a Jenkins build, the pipeline restores the build-specific `previous`
app or worker when the final container fails health checks. After a successful
live smoke, those temporary containers are removed.

For a regression discovered later:

1. revert the offending change on `dev`;
2. let Jenkins deploy and verify the revert;
3. promote the revert through the normal pull request to `main`;
4. use a retained image only for an immediate server-health emergency, then
   reconcile source control.

Do not use retired AWS commands or edit migrations to imitate a rollback.

## Related References

- [Infrastructure map](README.md)
- [Import worker runbook](../docs/operations/import-worker.md)
- [Target hosting ADR](TARGET_HOSTING.md)
- `Jenkinsfile`
- `scripts/prebuild-migrate.mjs`
