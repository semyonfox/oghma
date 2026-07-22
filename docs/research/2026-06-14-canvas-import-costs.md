# Canvas Import Cost Study

> **Status:** Dated research snapshot; not a live provider-price sheet
> **Study generated:** 2026-06-14 at 22:23
> **Last reviewed:** 2026-07-22
> **Source of truth for:** The aggregate workload measured by the June 2026 app-scoped Canvas audit and the assumptions used in that cost model. Current product allowances live in [pricing.md](../product/pricing.md).

## Executive Read

A first Canvas import and a recurring sync are different workloads. The audited first-import backlog was about fourteen times the account's average monthly page arrival.

Product and infrastructure planning should therefore:

- separate one-time onboarding processing from recurring use;
- estimate page volume before starting a large history;
- let the user narrow, approve, or defer a large import;
- show background progress and queue state;
- prefer direct extraction for suitable digital documents;
- batch OCR-heavy onboarding work rather than fund idle GPU capacity.

The managed document API figure in this study is an **upper-bound benchmark**, not a cost floor and not the intended steady-state processing path.

## Aggregate Workload

The app-scoped audit followed the import behavior available at the time: active courses, module file items, direct assignment attachments, and the application's supported processable formats.

| Metric | Observed value |
|---|---:|
| Visible files in scope | 419 |
| Processable files | 351 |
| Counted pages | 8,603 |
| PDF pages | 8,330 |
| Plain-text pages | 237 |
| PowerPoint slides counted as pages | 33 |
| Average recurring arrival | 614 pages/month |
| Peak observed month | 1,146 pages |

PDFs represented about 97% of counted pages, so PDF extraction and OCR behavior dominate the model.

The workload was concentrated: the three largest course groups accounted for 45.2% of pages and the five largest for 65.0%. This supports course- or module-level selection and warnings instead of an all-history default.

## Dated Cost Inputs

The original model used these June 2026 inputs:

| Input | Value |
|---|---:|
| Managed API benchmark | USD 35.18 per 1,000 pages |
| L4 rental | USD 0.31/hour at 1.16 pages/second |
| RTX 4090 rental | USD 0.69/hour at 2.2 pages/second |
| L40S rental | USD 0.79/hour at 2.2 pages/second |
| H100 rental | USD 2.89/hour at 25 pages/second |

These rates and throughput figures were inputs to the original audit, not independently reproducible benchmarks stored in this repository. They exclude startup time, minimum billing, failed jobs, retries, engineering, storage, queueing, monitoring, and quality control. Rebenchmark the actual extraction stack before a spend decision.

The July Marker++ corpus reports now supersede these GPU throughput and
provider-cost assumptions for serving decisions. Use the canonical benchmark
directory linked from [the documentation index](../README.md); retain this
study for its 8,603-page onboarding and 614-page recurring workload evidence.

## Modelled Results

| Path | First-backlog raw runtime | First-backlog raw cost | Average recurring raw cost | Planning use |
|---|---:|---:|---:|---|
| Managed API benchmark | external service | USD 302.55 | USD 21.60/month | Upper-bound benchmark or emergency fallback |
| L4 | about 2.1 hours | USD 0.64 | USD 0.05/month | Low-urgency scheduled batches |
| RTX 4090 | about 1.1 hours | USD 0.75 | USD 0.05/month | Practical worker-class benchmark |
| L40S | about 1.1 hours | USD 0.86 | USD 0.06/month | Additional memory or concurrency headroom |
| H100 | about 5.7 minutes | USD 0.28 | USD 0.02/month | Modelled burst for a well-filled batch |

The GPU figures are raw arithmetic under idealized throughput. They must not be presented as delivered per-user cost until startup, minimum billing, batching efficiency, failure rate, and extraction quality are measured end to end.

## Storage Cross-Check

A separate homelab measurement on 2026-06-18 found about 1.2 GB of S3-compatible object storage across one heavy pre-launch account and test data:

| Object group | Measured size |
|---|---:|
| Canvas files | 896.6 MiB |
| Vault uploads | 167.0 MiB |
| Vault exports | 92.3 MiB |
| Notes and attachments | 29.3 MiB |

This small, non-representative sample suggests object storage is less likely to dominate margin than OCR, AI use, queue operations, and vector capacity. It also identifies temporary vault uploads and exports as retention-policy candidates.

Vector storage has since moved from PostgreSQL to Qdrant. Pre-migration measurements found 15,341 vectors at 4,096 dimensions; use that only as a historical scale point, not as the current PostgreSQL footprint.

## Implications For Product Design

- Use pages rather than files for estimates and allowances.
- Keep onboarding and recurring allowances separate.
- Show estimates before processing and report queued, extracting, indexing, complete, failed, and cancelled states.
- Route digital-native documents through direct extraction when quality is adequate.
- Reserve OCR for scanned or image-heavy files.
- Use temporary, batched GPU capacity only after measuring startup and queue-fill behavior.
- Keep managed APIs as fallback options unless a new benchmark changes the economics materially.

The current allowance decisions derived from this evidence are maintained only in [pricing.md](../product/pricing.md).

## Method Summary

- Processable formats included PDF, Word, PowerPoint, Markdown, and plain text.
- Images counted as one page.
- PowerPoint page count used slide XML entries.
- Word and OpenDocument files used page metadata when present, otherwise a flagged 400-words-per-page estimate.
- Legacy `.ppt` files without ZIP/XML metadata require conversion for a reliable count.
- Monthly arrival used Canvas `created_at`, falling back to update or modification time.
- Recurring estimates treated file timestamps as a proxy for new content arrival.

## Limitations

- The corpus came from one heavy account and is not a representative student cohort.
- The audit scope did not include every file visible through every Canvas endpoint.
- File timestamps are an imperfect proxy for monthly sync demand.
- OCR need and throughput vary significantly by document type and quality.
- GPU and API inputs are volatile and were not accompanied by a reproducible provider-price capture.
- Marker licensing, quality, startup, and production operating behavior still require validation.

Rerun this study with anonymized aggregate data from the beta cohort before changing allowances, committing to GPU capacity, or quoting per-user processing cost.
