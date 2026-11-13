# Launch Checklist

> **Status:** Active launch gate
> **Last reviewed:** 2026-11-13 (hard-blocker evidence added after the issue triage)
> **Source of truth for:** Readiness to invite beta users or enable paid checkout. Product sequencing lives in [roadmap.md](roadmap.md); prices and allowances live in [pricing.md](pricing.md).

Unchecked items are not assumed complete. Record evidence or a link when closing a gate.

## 1. Hard Beta Blockers

- [ ] Verify a real production Canvas PDF reaches extraction, indexing, Qdrant, and relevant search/chat retrieval.
  2026-11-13: prod data shows 1,326 Canvas PDF notes indexed with chunks and a green Qdrant collection. Jenkins `oghma-prod` #180 and `oghma-dev` #455 set `CANVAS_CONTENT_IMPORT=on` on the app and the worker, and both `/api/health` endpoints returned 200 afterwards. The search and cited-chat steps of the [production import QA](../operations/import-worker.md#production-import-qa) are still to run by hand (#304).
- [ ] Configure and test production verification, password-reset, welcome, and import-complete email delivery.
  2026-11-13: prod sends through Resend. Both password accounts created since the 2026-09-25 email fix have verified their address, so verification mail arrives. A reset request to a real inbox is still untested (#305).
- [ ] Rotate development and default auth/encryption secrets in both live environments.
  2026-11-13: no default values in either environment. Dev and prod had shared `JWT_SECRET`, `NEXTAUTH_SECRET` and `SERVER_ENCRYPTION_SECRET`. Jenkins `oghma-dev` #455 is running dev's own copies, and both stored dev Canvas tokens decrypt with the new key. Prod was left on the previous values. On prod those two auth secrets are the same string, and NextAuth falls back to `JWT_SECRET` (`src/auth.config.ts`). Provider keys and the R2 bucket are still shared between dev and prod (#306).
- [ ] Review `/privacy`, `/terms`, and `/cookies` against the actual providers, analytics, retention, and chat behavior.
- [ ] Back up PostgreSQL and object storage offsite; complete a restore rehearsal.
  2026-11-13: nightly Postgres, Qdrant and RustFS exports go offsite to B2, with a 48-hour freshness alarm. Prod files live in R2, which the backup does not copy. No restore rehearsal yet.
- [ ] Add basic uptime, disk, database, Qdrant, queue, and container/runtime health monitoring.
  2026-11-13: a Sentry uptime monitor checks `https://oghmanotes.ie/api/health` every 5 minutes. The dev monitor exists but is disabled on the current Sentry plan. Host metrics run in Netdata. Queue-age and stalled-job alerts are still missing (#328).
- [ ] Make long OCR, queue, and indexing waits explicit in the product.

## 2. Security And Data Protection

- [ ] Confirm credentials authentication is intentionally enabled and hide any unconfigured OAuth options.
- [ ] Confirm login rate limiting and repeated-failure behavior in the deployed runtime.
- [ ] Keep PostgreSQL, Redis, Qdrant, and object storage off the public network.
- [ ] Confirm browser object access uses presigned or proxied URLs and private buckets.
- [ ] Review Cloudflare tunnel, proxy, WAF, and rate-limit rules for auth, upload, Canvas, contact, and chat endpoints.
- [ ] Store production secrets only in the selected runtime secret store or protected Jenkins environment files.
- [ ] Verify account deletion, grace-period recovery, and user export end to end. Deleting an account deactivates it at once, and the worker's daily purge erases it 30 days later (#612). Recovery inside those 30 days is a manual support step with no tooling yet.
- [ ] Verify that the privacy policy covers stored chats, model evaluation, lead capture, first-party analytics, and retention periods.
- [ ] Confirm the no-analytics-cookie posture in [anonymous usage counts](../engineering/anonymous-telemetry.md) matches the deployed site before deciding whether consent UI is required. The cookie notice describes language and theme preferences as browser storage; it should name the `ogma-locale` and `ogma-theme` cookies.
- [ ] Maintain a current processor and data-residency inventory for the actual launch stack.

## 3. Current Beta Infrastructure

- [ ] Confirm the production and development Jenkins environment files contain the required values without defaults.
- [ ] Confirm `DATABASE_URL` uses the application role and `MIGRATION_DATABASE_URL` uses the migrator role.
- [ ] Apply every migration in `database/migrations/` and verify the schema-migration ledger.
- [ ] Verify Qdrant has the correct per-environment collection, vector size, payload indexes, and backup/rebuild procedure. The rebuild steps are in the [vector index runbook](../operations/vector-index.md).
- [ ] Verify RustFS or the selected S3-compatible bucket from both app and worker containers.
- [ ] Verify Redis/BullMQ connectivity and healthy app and worker containers.
- [ ] Confirm the selected direct-extraction and Marker/OCR fallback behavior.
- [ ] Verify domain, TLS, Cloudflare tunnel, and health routes from outside the home network.
- [ ] Document capacity and failure behavior for the home ISP while the homelab remains user-facing.

Current homelab operations belong in the [homelab runbook](../../infra/HOMELAB.md); do not duplicate container commands here.

## 4. Launch-Target Infrastructure

- [ ] Select the final web runtime and verify all Node/App Router features on it.
- [ ] Select and load-test the relational database, Qdrant deployment, queue/Redis service, object storage, and worker runtime as one system.
- [ ] Test migrations with separate pooled application and administrative connections.
- [ ] Test uploads, downloads, presigned URLs, metadata, and vault import/export against the selected S3-compatible storage.
- [ ] Test queue retry, stalled-job, cancellation, and oldest-job-age behavior under import load.
- [ ] Benchmark temporary GPU startup, batch processing, timeout, retry, and shutdown behavior.
- [ ] Document migration, rollback, backup, restore, and provider-failure procedures before moving paid users.

The selected provider split and migration records belong in the [infrastructure index](../../infra/README.md), not in this checklist.

## 5. Manual Product QA

Run these against the environment users will receive:

- [ ] Register with a real email, verify it, log out, and log back in.
- [ ] Request and complete a password reset.
- [ ] Create and edit a note; reload and verify persistence.
- [ ] Upload and view a PDF.
- [ ] Connect a representative Canvas account.
- [ ] Import at least one digital PDF and one OCR-requiring file.
- [ ] Confirm imported content becomes searchable through Qdrant and produces a relevant cited answer.
- [ ] Generate and review flashcards.
- [ ] Create and complete a planning/time-block action.
- [ ] Export and re-import a small vault.
- [ ] Exercise friendly error and cancellation paths.
- [ ] Check the main flows on a phone and with keyboard navigation.
- [ ] Delete a test account and confirm the account is deactivated, every session cookie is cleared, the calendar feed, reset, verification and Canvas tokens are revoked, and queued Canvas and study jobs are cancelled. Check the purge removes it after the 30-day grace period.

## 6. Monitoring And Operations

- [ ] Alert on app and worker health, crash loops, and failed deployments.
- [ ] Alert on disk, PostgreSQL health, connection pressure, migration failure, and backup failure.
- [ ] Monitor Qdrant availability, collection size, memory, latency, and rebuild readiness.
- [ ] Alert on BullMQ queue age, failed and stalled jobs, retries, and Redis connectivity.
- [ ] Monitor object growth, upload/download errors, and unusual operation volume.
- [ ] Monitor transactional-email delivery and errors.
- [ ] Monitor AI, OCR/GPU, storage, database, and payment-provider usage or spend.
- [ ] Capture actionable frontend and API failures with an App Router-compatible error-monitoring setup if one is selected.
- [ ] Name an incident owner and document the first response for data loss, auth failure, and stuck imports.

## 7. Product And Messaging

- [ ] Audit the public site against [positioning.md](positioning.md); remove or label unfinished features.
- [ ] Make beta status and a real contact path visible.
- [x] Give an empty workspace a clear first action. The first-login welcome note and dialog shipped in a9df3ae0 (#314).
- [ ] Show page estimates, allowance impact, and confirmation before a large Canvas import.
- [ ] Explain when a job is queued, extracting, indexing, complete, failed, or cancelled.
- [ ] Replace raw errors, dead buttons, and ambiguous “coming soon” actions.
- [ ] Keep the public pricing page aligned only with [pricing.md](pricing.md).

## 8. Analytics Readiness

- [ ] Complete the deployment checks for [anonymous usage counts](../engineering/anonymous-telemetry.md). The older acquisition design is [retired](../history/2026-10-04-growth-analytics-retired.md).

## 9. Company And Payments

- [ ] Complete the applicable paid-launch prerequisites in [company-admin.md](company-admin.md).
- [ ] Reconfirm the accepted [payment processor decision](../decisions/2026-06-11-payment-processor.md), product eligibility, and current terms.
- [ ] Finalise entitlements and allowances in [pricing.md](pricing.md).
- [ ] Keep provider customer/subscription identifiers and billing state in the local database.
- [ ] Implement and test checkout, webhook idempotency, subscription changes, payment failures, cancellation, refunds, and the customer portal.
- [ ] Gate paid features from verified local billing state rather than synchronous provider calls.
- [ ] Test the complete payment lifecycle in test mode before enabling live checkout.

No price or company-formation detail should be duplicated in this checklist.

## 10. Rollout

- [ ] Confirm each target institution permits the Canvas connection method and user-token flow before marketing there.
- [ ] Choose invite-only or open registration and document the load/support implication.
- [ ] Identify an initial cohort willing to report failures and complete interviews.
- [ ] Provide a monitored feedback and support channel.
- [ ] Confirm the team can inspect registrations, imports, queues, analytics, logs, and backups without unsafe production access.
- [ ] Define the pause condition for imports or signups if capacity, cost, or data safety degrades.

## Exit Criteria

Invite beta users only when the hard blockers, security controls, current-stack checks, manual core flow, backup/restore path, and minimum monitoring are complete.

Enable paid checkout only after the beta gates plus company, processor, entitlement, billing-lifecycle, refund, and launch-target infrastructure checks are complete.
