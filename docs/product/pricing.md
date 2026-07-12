# Pricing And Allowance Plan

> **Status:** Current planning; paid checkout is not yet final
> **Last reviewed:** 2026-07-11
> **Source of truth for:** Public price ranges, plan entitlements, Canvas import allowances, and AI usage policy. Do not duplicate price figures in roadmaps, checklists, or decision records.

Provider prices and product limits remain planning inputs until checkout is enabled. Recheck them before making a billing or infrastructure commitment.

## Launch Plan

| Plan | Public framing | Intended entitlement |
|---|---:|---|
| Free first import | EUR 0 | A limited Canvas or one-module import, manual notes, a small AI allowance, spaced repetition, limited storage, and one vault |
| Semester | Planning range EUR 39–49 | Current-course Canvas sync, cited search and chat allowance, flashcards, planning tools, larger storage, and the standard processing queue |
| Academic year | Planning range EUR 79–89 | A future full-year option; keep checkout disabled until semester demand and limits are understood |

Monthly billing can remain a fallback, but it is not the main public anchor. A higher-usage plan and institution licences are later options, not launch promises.

The free experience must include the product's “semester appears” moment without offering an unlimited historical import. Exact caps should be shown before a user starts processing.

## Canvas Import Allowances

Canvas pages, not file count, are the commercial unit because one document can dominate OCR and indexing cost.

Current planning defaults:

| Allowance | Planning posture |
|---|---|
| Free first import | One limited import or module with a clear page cap; final cap to be set from beta data |
| Paid onboarding | A separate 2,000–3,000-page allowance for the initial backlog |
| Recurring semester use | Start around 1,000 new or changed pages per month |
| Large histories | Estimate first, then let the user approve, defer, narrow, or purchase additional processing |
| Future heavy usage | Higher limits and queue priority rather than a separate feature set |

These are planning defaults, not contractual entitlements. Change them only after rerunning the [Canvas import cost study](../research/2026-06-14-canvas-import-costs.md) against a broader beta cohort.

## AI Usage

Use weighted units rather than treating every request or model as equal. The default model can count as 1x; more expensive models should use a multiplier based on current provider cost and measured token use.

The product should display a simple allowance to students while keeping the underlying weighting auditable. Do not promise identical effective usage across models with materially different costs.

## Unit-Economics Guardrails

At the proposed semester range, the monthly-equivalent gross revenue is roughly EUR 10 before payment fees and operating costs. The goal is to keep ordinary recurring AI, OCR, and storage cost below roughly EUR 1 per active paid student per month, excluding unusually large first-import backlogs.

The largest margin risks are:

- uncapped historical Canvas imports;
- OCR retries and idle or poorly batched GPU time;
- high-cost model and reranker use;
- growth in Qdrant vectors and related query capacity;
- support and recovery work for failed imports.

Object storage is comparatively inexpensive. A June 2026 pre-launch measurement found about 1.2 GB of objects for one heavy student plus test data. That sample is useful for scale order only and is not representative of a mature cohort.

## Current Cost Model

The live homelab shape uses:

- PostgreSQL for relational records and text chunks;
- Qdrant for 4,096-dimensional chunk vectors;
- RustFS or another S3-compatible object store;
- Redis and BullMQ for background jobs;
- configurable LLM, embedding, rerank, and document-extraction providers.

Qdrant is current infrastructure, not a hypothetical alternative. The pre-Qdrant PostgreSQL embedding footprint remains historical measurement evidence only.

For Canvas extraction:

- route digital-native files through cheaper direct extraction where quality is adequate;
- reserve OCR for scanned or image-heavy material;
- batch heavy work on temporary GPU capacity when practical;
- keep managed document APIs as an emergency fallback or upper-bound benchmark, not the normal import path;
- show queue and processing state instead of promising instant completion.

Launch-hosting provider choices belong in the infrastructure documentation. This plan should remain valid if a vendor changes.

## Upgrade Triggers

Increase spend only in response to measured pressure:

| Pressure | Upgrade signal |
|---|---|
| App/runtime | Sustained latency, restarts, or availability problems |
| PostgreSQL | Storage, connection, or query limits approached |
| Qdrant | Search latency, memory, vector count, or index maintenance degrades |
| Queue/worker | Oldest-job age or failure rate exceeds the user-facing promise |
| GPU/OCR | Batches are consistently large enough to use longer worker windows efficiently |
| Storage | Retained objects and operations materially exceed the included provider envelope |

Do not buy reserved or always-on capacity until real queue demand and revenue justify the commitment.

## Billing Decision

The current processor decision is Stripe Managed Payments, subject to eligibility and a fresh terms check before implementation. The rationale and alternatives live in the [payment processor decision](../decisions/2026-06-11-payment-processor.md).

Keep billing state provider-neutral in the application and enforce entitlements from local, webhook-updated subscription state. Company and paid-launch prerequisites live in [company-admin.md](company-admin.md) and [launch-checklist.md](launch-checklist.md).

## Before Enabling Checkout

- Finalise the free, onboarding, recurring, and AI allowances from beta evidence.
- Recheck payment-provider fees, product eligibility, payout terms, and refund behavior.
- Benchmark extraction throughput and minimum-billing waste on the selected GPU path.
- Load-test PostgreSQL, Qdrant, queues, storage, and the chosen runtime together.
- Publish exact renewal, cancellation, refund, and allowance wording.
- Add cost, queue-age, failure, and provider-usage monitoring.
