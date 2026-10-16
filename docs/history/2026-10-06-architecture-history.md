# Architecture History

> **Status:** Historical record; not an operations guide. Moved from `docs/engineering/` on 2026-10-16 (it was `docs/architecture-evolution.md` before the July consolidation).
>
> **Last reviewed:** 2026-10-16
>
> **Source of truth:** Git history and the dated infrastructure records linked below

This is the short history of OghmaNotes infrastructure. For the running system, use [Architecture](../engineering/architecture.md).

## 1. University monolith — September 2025 to February 2026

The project began as Socsboard, a CT216 group project, and was renamed OghmaNotes in February 2026. A single Next.js process served the UI and APIs against local PostgreSQL and S3-compatible storage. The Notea-derived note editor, authentication, tree storage, Canvas groundwork, and early RAG work grew inside this monolith.

## 2. AWS application stack — March to May 2026

The first hosted stack used Amplify SSR and CloudFront with PostgreSQL on RDS, Valkey/Redis-compatible caching, S3, SQS-backed workers, a Lambda chat-streaming path, SES, and an optional scale-to-zero GPU path. An April 2026 account/region migration retained the same overall design.

The durable lessons were that Lambda limits complicated long-lived chat streams and fixed database, cache, and network costs were too high for a pre-revenue product.

## 3. Homelab consolidation — from May 2026

The application and worker moved to Docker on the homelab behind outbound Cloudflare tunnels. Jenkins became the branch-aware build, smoke-test, migration, health-check, and swap controller. Redis/BullMQ replaced the live SQS path, RustFS supplied S3-compatible storage, and Qdrant replaced pgvector for chunk vectors in June 2026.

This phase also introduced a clearer app/worker split, per-environment queue and vector naming, orphan-job reclamation, and optional local or rented Marker OCR behind a shared client contract.

Since July the homelab shape has stayed the same, but a few things changed underneath it:

- Serverless Marker on RunPod or Vast was added behind a durable `app.marker_jobs` state machine, as an option rather than the live default.
- Chat generation moved onto the worker as durable BullMQ jobs with replayable Redis streams, and every chat or Canvas write became a stored proposal the user has to approve.
- Note saves stopped embedding inline in October 2026; the worker rebuilds a note's search index from a delayed, deduplicated `note-reindex` job.
- Operational logs became anonymous on 2026-10-04: the logger keeps only a severity, a fixed category and a status class. Sentry error and trace reporting was added on 2026-10-08 as the replacement for detail, but stays off until a DSN is configured.
- The worker entry stayed at `src/lib/canvas/worker-entry.ts`; its consumer, periodic-task, heartbeat and maintenance helpers moved into `src/lib/worker/` on 2026-10-16, and the healthcheck now reads a heartbeat file.
- The October 2026 [domain audit](2026-10-06-domain-audit.md), landed on `dev` on 2026-10-16, deleted the unused reranker modules and the Redis copy behind single-note reads.

## 4. Launch-provider target — planned, not historical fact

The provider target has considered Cloudflare edge, email, R2, and Queues; managed PostgreSQL; a normal Node worker; and on-demand GPU processing. These are migration options rather than a completed phase. Current decisions and open reconciliation points live in [`infra/TARGET_HOSTING.md`](../../infra/TARGET_HOSTING.md).

## Related initiatives

- The Canvas MCP work consolidated a large Canvas API tool catalogue, then
  exposed a narrower student-oriented profile through OghmaNotes. That profile
  still includes user-scoped mutations and is not a read-only safety
  boundary.
- Marker performance work profiled PDF/OCR stages and informed the optional RunPod and homelab serving paths. The fork's experiments should not be confused with code installed in a live image.

Historical infrastructure details remain in the git history and [`infra/`](../../infra/). Do not restore old AWS commands or prices without revalidating the provider, code path, and current service limits.
