# Architecture History

> **Status:** Historical record; not an operations guide
>
> **Last reviewed:** 2026-07-11
>
> **Source of truth:** Git history and the dated infrastructure records linked below

This is the short history of OghmaNotes infrastructure. For the running system, use [Architecture](architecture.md).

## 1. University monolith — September 2025 to February 2026

The project began as Socsboard, a CT216 group project, and was renamed OghmaNotes in February 2026. A single Next.js process served the UI and APIs against local PostgreSQL and S3-compatible storage. The Notea-derived note editor, authentication, tree storage, Canvas groundwork, and early RAG work grew inside this monolith.

## 2. AWS application stack — March to May 2026

The first hosted stack used Amplify SSR and CloudFront with PostgreSQL on RDS, Valkey/Redis-compatible caching, S3, SQS-backed workers, a Lambda chat-streaming path, SES, and an optional scale-to-zero GPU path. An April 2026 account/region migration retained the same overall design.

The durable lessons were that Lambda limits complicated long-lived chat streams and fixed database, cache, and network costs were too high for a pre-revenue product.

## 3. Homelab consolidation — from May 2026

The application and worker moved to Docker on the homelab behind outbound Cloudflare tunnels. Jenkins became the branch-aware build, smoke-test, migration, health-check, and swap controller. Redis/BullMQ replaced the live SQS path, RustFS supplied S3-compatible storage, and Qdrant replaced pgvector for chunk vectors in June 2026.

This phase also introduced a clearer app/worker split, per-environment queue and vector naming, orphan-job reclamation, and optional local or rented Marker OCR behind a shared client contract.

## 4. Launch-provider target — planned, not historical fact

The provider target has considered Cloudflare edge, email, R2, and Queues; managed PostgreSQL; a normal Node worker; and on-demand GPU processing. These are migration options rather than a completed phase. Current decisions and open reconciliation points live in [`infra/TARGET_HOSTING.md`](../../infra/TARGET_HOSTING.md).

## Related initiatives

- The Canvas MCP work consolidated a large Canvas API tool catalogue, then
  exposed a narrower student-oriented profile through OghmaNotes. That profile
  still includes user-scoped mutations and is not a read-only safety
  boundary.
- Marker performance work profiled PDF/OCR stages and informed the optional RunPod and homelab serving paths. The fork's experiments should not be confused with code installed in a live image.

Historical infrastructure details remain in the git history and [`infra/`](../../infra/). Do not restore old AWS commands or prices without revalidating the provider, code path, and current service limits.
