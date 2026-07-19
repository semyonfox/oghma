# Target Hosting Architecture

> Status: Future-state architecture decision; not the running stack
>
> Audience: Maintainers planning a post-homelab migration
>
> Last reviewed: 2026-07-11

The current runtime remains the
[homelab Docker/Jenkins stack](HOMELAB.md). This document records migration
intent and decision gates. No provider listed here should be treated as
provisioned until its phase is implemented and verified.

## Decision

Use Cloudflare for edge and platform-adjacent services while preserving a
normal Node/Docker runtime for workloads that depend on long-lived processes,
Node streams, large files, and local extraction libraries.

| Area | Target direction |
|---|---|
| DNS, CDN, TLS, WAF/bot controls | Cloudflare |
| Web app | Trial Cloudflare Workers with OpenNext; retain a Node/Docker fallback |
| Background worker | Long-running Node/Docker worker |
| Queue transport | Cloudflare Queues through the existing queue facade if the trial passes |
| Relational database | Managed PostgreSQL, with Neon as the current candidate |
| Vector database | Qdrant-compatible service/deployment; active code no longer treats pgvector as primary vector storage |
| Object storage | Cloudflare R2 through the existing S3-compatible interface |
| Transactional email | Cloudflare Email Sending REST API |
| Human inboxes | Google Workspace |
| Document GPU work | On-demand workers or batches rather than permanent launch capacity |

Named providers are candidates, not contracts. Recheck current compatibility,
data location, support, limits, and pricing before migration.

## Current Code Constraints

The application currently assumes:

- a standalone Node-compatible Next.js runtime;
- a long-running worker started from `src/lib/canvas/worker-entry.ts`;
- queue publication through `src/lib/queue.ts`;
- Redis/BullMQ by default, with Cloudflare Queues HTTP publish/pull available
  behind `QUEUE_PROVIDER`;
- PostgreSQL for relational data and migrations;
- Qdrant for active vector embeddings;
- S3-compatible object storage;
- streaming chat and download/upload routes;
- Node-oriented PDF parsing, SDKs, timers, and signal handling.

These constraints make a web-app Workers trial reasonable, but they do not
make a full backend move a configuration-only change.

## Web App Decision Gate

Keep an OpenNext/Workers deployment only if a production-like trial verifies:

- authentication callbacks, cookies, and protected routes;
- chat streaming and cancellation;
- uploads, downloads, storage proxying, and `Buffer`/stream behavior;
- PostgreSQL connection handling through an appropriate pooler;
- API-to-queue publication without direct BullMQ assumptions;
- external Node package compatibility;
- security headers, public metadata routes, and locale behavior;
- build reproducibility, observability, and rollback;
- migrations running as a separate controlled step.

If that trial requires broad rewrites or weakens reliability, deploy the app
and worker as Node containers and retain Cloudflare for DNS, proxying, R2,
email, and other independently useful services.

## Queue and Worker Boundary

Cloudflare Queues can replace the transport while the consumer remains a
long-running Node process:

1. app producers publish through `src/lib/queue.ts`;
2. the Node worker pulls and acknowledges through the same facade;
3. job state remains in PostgreSQL;
4. extraction and embeddings remain outside the Workers request lifecycle.

Before switching:

- verify environment-prefixed queue isolation;
- test visibility timeout, acknowledgement, retry, and poison-message behavior;
- verify vault import retry constraints;
- compare throughput and operational recovery with BullMQ;
- retain a documented provider rollback.

Do not fork API routes into provider-specific enqueue implementations.

## Data Boundary

### PostgreSQL

Move relational data only after:

- all migrations pass against the candidate service;
- pooling and connection limits survive app plus worker load;
- backup, restore, point-in-time recovery, and migration credentials are
  tested;
- dev and production are isolated.

pgvector may remain installed for migration compatibility, but the active
architecture stores vectors in Qdrant. Do not select a relational provider
based on the old assumption that it must serve production vector search.

### Qdrant

Choose a Qdrant deployment with:

- separate dev and production collections or projects;
- backups and restore testing;
- private/authenticated network access;
- capacity for embedding dimensions and workload growth;
- measured search and indexing latency;
- a tested migration from the current collection.

### R2

The storage abstraction already uses S3-compatible configuration. Preserve
logical object keys and `STORAGE_PREFIX` during migration because database
rows refer to those keys. Validate multipart upload, range requests, download
headers, export links, lifecycle policy, and rollback before cutover.

## Email Boundary

The Node app already uses the Cloudflare Email Sending REST API. Project policy
keeps Google Workspace authoritative for root-domain inbound mail; verify the
live MX records before changing DNS. Do not enable Cloudflare Email Routing on
the same root MX; use a deliberately configured subdomain if routing is needed.

See [email operations](../docs/operations/email.md).

## Migration Phases

1. **Baseline** current homelab latency, throughput, storage, queue recovery,
   backups, and monthly cost.
2. **Move independent services** such as R2/email only after end-to-end tests.
3. **Trial queue transport** through the existing facade with dev isolation.
4. **Trial managed PostgreSQL and Qdrant** with restore and load tests.
5. **Trial the web app** on Workers/OpenNext; keep Node fallback deployable.
6. **Move production** one stateful boundary at a time with rollback evidence.
7. **Retire homelab production** only after backup restoration and an
   observation window succeed.

## Open Decisions

- Workers/OpenNext versus a Node container for the web app.
- Managed versus self-operated Qdrant.
- Managed PostgreSQL provider and pooling method.
- Cloudflare Queues versus BullMQ on the future worker host.
- GPU provider, batching threshold, and synchronous versus asynchronous Marker
  protocol.
- Required regional placement, support tier, and recovery objectives.

## Primary References

- [Cloudflare Next.js guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- [Cloudflare Queues](https://developers.cloudflare.com/queues/)
- [Cloudflare R2 S3 compatibility](https://developers.cloudflare.com/r2/api/s3/api/)
- [Cloudflare Email Service](https://developers.cloudflare.com/email-service/)
- [OpenNext Cloudflare adapter](https://opennext.js.org/cloudflare)
- [Neon documentation](https://neon.com/docs/)
- [Qdrant documentation](https://qdrant.tech/documentation/)

Recheck primary documentation before implementing a phase. Avoid copying
numeric limits or pricing into this ADR.
