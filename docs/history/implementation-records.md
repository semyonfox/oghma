# Implementation Decision Records

> **Status:** Historical record; not a current runbook
>
> **Last reviewed:** 2026-07-11
>
> **Source of truth:** Consolidated `docs/superpowers` plans/specs, checked against current file and migration names where noted

These condensed records explain why features were designed and preserve useful acceptance criteria. They do not establish current deployment state. Use current code, migrations, and [`../engineering/`](../engineering/) for active behaviour.

## 2026-03-27 — email verification and auth cleanup

**Decision.** Credentials registrations should verify email before receiving a usable session. Verification and password-reset tokens should share generation/hashing utilities, be hashed at rest, expire, and avoid account-enumeration leaks. OAuth users must remain compatible.

**Verification clues.** Registration, login, verification, resend, password-reset, and `/api/auth/me` should be tested together. Confirm token replacement/expiry and responses for both known and unknown accounts. Do not infer current security behaviour from this record alone.

## 2026-03-29 — server-managed AI settings

**Decision.** The first AI settings surface could show the configured server model while per-user selection and BYOK remained unavailable. Client-submitted model changes were not intended to override the server policy.

**Verification clues.** Check the current settings GET/POST contract, unknown-model display, disabled-control accessibility, and environment-sensitive tests before describing the feature.

## 2026-03-29 and 2026-05-13 — vault import/export

**Decision.** Vault archives should import/export asynchronously, stream rather than buffer whole archives, preserve folder structure, report progress, and produce downloadable exports. Later hardening added active-job conflict responses, forced replacement, cooperative cancellation, optional RAG skipping, portable email delivery, and cleanup expectations.

**Durable implementation references.** Vault jobs share `app.canvas_import_jobs`; migration `029_vault_progress_and_cancel.sql` added progress/cancellation fields. Current workers are `src/lib/vault/import-worker.ts` and `src/lib/vault/export-worker.js`.

**Known boundary.** Vault import queue messages intentionally use one attempt because partial retries can create duplicate notes. Treat retry safety and orphan cleanup as code-dependent, not guaranteed by the original plan.

**Verification clues.** Exercise large streaming archives, path preservation, conflicts, force replacement, cancellation between files, partial failure cleanup, download expiry, and re-import of an export.

## 2026-03-29 — quiz study-flow redesign

**Decision.** Hide FSRS rating mechanics from learners, map correctness to scheduling server-side, simplify the session UI, and provide skip/continue/completion states, keyboard shortcuts, and review/streak calendar signals. The FSRS library and question-generation architecture were out of scope.

**Verification clues.** Confirm correctness-to-rating mapping, progress across skip/continue, completion persistence, shortcut behaviour inside inputs, and calendar dates against stored reviews.

## 2026-03-31 — chat SSE streaming

**Decision.** `POST /api/chat` should support SSE token/tool events while preserving a non-stream response path. Streamed messages should persist and reload like non-streamed messages, and malformed or interrupted streams should leave a recoverable UI.

**Verification clues.** Cover metadata, token ordering, tool events, explicit completion, errors, client aborts, persistence, reload, and legacy non-stream clients. Later lifecycle decisions are summarized in [`handovers.md`](handovers.md).

## 2026-04-03 and 2026-04-08 — chat interaction design

**Decision.** `/chat` is a focused full-page workspace while `/notes` keeps a compact contextual chat. Navigation, conversation list, thread, context, and composer need predictable independent scrolling. Assistant messages should be content-centred, with subtle tool indicators, calm streaming states, stable composer geometry, and no unnecessary avatars/model labels.

**Data decision.** Plain assistant text remains `content`; structured `parts` carry durable tool and other UI segments while legacy plain-text messages degrade gracefully.

**Verification clues.** Check desktop/mobile overlap, keyboard focus, long-thread scrolling, composer reachability, streaming/reload parity, and structured tool indicators after refresh.

## 2026-04-03 — account deletion grace period

**Decision.** Account deletion should deactivate access immediately, retain data for a 30-day recovery window, and hard-delete expired accounts through an idempotent dependency-aware cleanup path.

**Current gap found during consolidation.** The soft-delete route and login rejection exist, but no user recovery endpoint, shared hard-deletion helper, or scheduled expired-account cleanup path was found in the reviewed code. Current UI directs users to contact support. Do not promise automated recovery or permanent deletion after 30 days until those paths are implemented and tested.

**Verification clues.** Test immediate login rejection, support recovery procedure, expiry selection, and complete deletion of notes, objects, sessions, jobs, chat, and other user-owned records.

## 2026-04-03 — unified design language

**Decision.** Use semantic Tailwind/CSS tokens, calm content-first app surfaces, restrained glass cards/panels, serif type only for deliberate page titles, and standard spacing/type scales. Preserve the dense file-tree styling until a deliberate redesign.

The active contract is [`../engineering/design-system.md`](../engineering/design-system.md); this entry exists only to preserve the rationale.

## 2026-04-04 — Marker GPU prewarm (superseded AWS plan)

**Historical decision.** The AWS-era plan proposed an on-demand GPU path, a baked Marker image, prewarming, and delayed richer OCR after a text-layer fallback. The AWS ASG/AMI implementation is obsolete.

**Durable lesson.** `pdf-parse` is not OCR, cold/unavailable OCR needs honest processing states, and fallback extraction must not be misrepresented as full indexing. Current provider and retry behaviour belongs in [`../engineering/import-pipeline.md`](../engineering/import-pipeline.md).

## 2026-04-13 — active and inactive courses

The original filename incorrectly used 2025; git history places this work on **2026-04-13**.

**Decision.** Course activity is user-scoped. Inactive Canvas courses should disappear from default quiz and assignment study flows while their notes remain available for reference/search. Migration `017_user_course_settings.sql` introduced the persistence layer.

**Verification clues.** Toggle a course in both directions, check quiz and assignment filtering, confirm notes remain accessible, and confirm one user's setting does not affect another user.
