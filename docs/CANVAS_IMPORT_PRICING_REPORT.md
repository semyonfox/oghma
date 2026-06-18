# Canvas Import Pricing Report

Status: current source of truth for Canvas import economics.
Generated from the app-scoped Canvas audit on 2026-06-14 at 22:23.

This report supersedes older rough OCR/import cost estimates in [PRICING.md](PRICING.md). The key distinction is that a user's first Canvas import is a large one-time backlog, while recurring monthly sync volume is much smaller.

## Executive Decision

Price recurring usage separately from the first-import backlog.

Launch with:

- A recurring monthly page allowance for normal Canvas syncs.
- A separate onboarding allowance or import-credit flow for first imports.
- User confirmation before processing large backlogs.
- Background processing with visible progress and queue status.
- On-demand GPU batches for heavy onboarding work, not always-on GPU capacity.

Managed API pricing is useful as a conservative cost floor, but it is not viable as the steady-state processing path for large Canvas backlogs.

## Key Numbers

| Metric | Value | Notes |
|---|---:|---|
| App-scoped visible files | 419 | Active courses and files visible to the current import flow |
| Processable files | 351 | PDF, Office, text, and markdown |
| Counted pages | 8,603 | No unknown page counts in this audit |
| Managed API page price | $35.18 / 1,000 pages | Conservative benchmark |
| First import API cost | $302.55 | One-time backlog cost at managed API pricing |
| Average recurring pages | 614 pages/month | Observed monthly average |
| Average recurring API cost | $21.60/month | At managed API pricing |
| Peak observed month | 1,146 pages | 2025-10 |
| H100 first-import raw runtime | 5.7 minutes | Modelled at 25 pages/sec |
| H100 first-import raw compute | $0.28/user | At $2.89/hour |

The first import is about 14x the average monthly API run-rate. Bundling it into normal monthly usage would hide the largest margin risk.

## Storage Footprint Cross-Check

Measured homelab storage on 2026-06-18 gives a useful sanity check for import-related storage pricing. The RustFS/S3-compatible bucket held about 1.2 GB total, mostly from one heavy note-taking CS student plus test/friend accounts. The main object-storage driver was Canvas files:

| Object group | Measured size |
|---|---:|
| Canvas files | 896.6 MiB |
| Vault uploads | 167.0 MiB |
| Vault exports | 92.3 MiB |
| Notes/attachments | 29.3 MiB |

At Cloudflare R2 Standard pricing, this is inside the 10 GB free monthly storage allowance. Even without the free allowance, 1.2 GB is about $0.02/month in storage. For pricing purposes, object storage is not the Canvas import margin risk; OCR/import processing and database embeddings are.

The observed heavy user is only about halfway through a 4-year CS degree. A 4th/5th-year engineering student importing historical Canvas content could plausibly be 2x-3x the measured object footprint. See [PRICING.md](PRICING.md) for the current per-user storage planning table.

## Launch Allowance Model

The product limits are still to be finalized, but the current planning default is:

| Allowance | Planning Default | Rationale |
|---|---:|---|
| Recurring Standard allowance | ~1,000 pages/month | Covers the observed average and most normal monthly course updates |
| Onboarding allowance | 2,000-3,000 pages | Lets normal users start without surprise; large backlogs require confirmation |
| Large import handling | Ask, defer, or charge credits | Prevents accidental 8,000+ page imports from consuming margin silently |
| Premium differentiation | Priority queue + higher limits | Keep feature maintenance cost flat while monetizing heavier users |

Use page volume as the commercial unit. File count is misleading because one large PDF or text file can dominate processing cost.

## AI Usage Units

AI usage should use a Copilot-style unit budget rather than raw request counts.

The exact multipliers must be tied to real provider costs, but the intended shape is:

| Model Class | Example | Usage Weight |
|---|---|---:|
| Low-cost/default | DeepSeek V3.2 or similar | 1x |
| Higher-cost/better model | Kimi K2.7 or similar | 4x, or whatever real cost ratio requires |

This lets users choose better models without letting expensive model choices break the Standard margin.

## Compute Strategy

| Stage | Worker Policy | Trigger | Cost Control |
|---|---|---|---|
| Launch | On-demand GPU batches or temporary worker runs | Import queue has enough work or max wait time is reached | Avoid idle GPU spend |
| Onboarding cohorts | H100 burst | Several first imports waiting | Amortize minimum billing across users |
| Daily sync | 4080/4090-class worker, L4, or similar | Queue age or scheduled sync windows | Short scheduled runs |
| Growth | Longer worker windows | Sustained queue volume | Scale windows before buying always-on capacity |

Do not use Datalab or similar managed document APIs as the normal processing path. The page volume makes them too expensive for Oghma's Canvas import model. Keep managed APIs only as an emergency fallback or benchmark reference.

## API Vs GPU Cost

Reference rates from the audit:

| Path | Initial Runtime | Initial Cost/User | Avg Monthly Cost/User | Use When |
|---|---:|---:|---:|---|
| Managed API | External service | $302.55 | $21.60 | Benchmark or emergency fallback only |
| NVIDIA L4 | 2.1h | $0.64 | $0.05 | Low-urgency scheduled background queues |
| RTX 4090 | 1.1h | $0.75 | $0.05 | Default practical worker class while benchmarking |
| L40S | 1.1h | $0.86 | $0.06 | More memory/concurrency headroom |
| H100 | 5.7m | $0.28 | $0.02 | Batched first imports, then shut down |

Rates used: L4 $0.31/hour, RTX 4090 $0.69/hour, L40S $0.79/hour, H100 $2.89/hour.

These are raw rental compute estimates. They exclude engineering, storage, monitoring, retries, quality control, queue operations, and minimum billing waste.

## Workload Evidence

### Pages By Month

| Month | Pages |
|---|---:|
| 2024-09 | 994 |
| 2024-10 | 374 |
| 2024-11 | 582 |
| 2025-01 | 661 |
| 2025-02 | 669 |
| 2025-03 | 737 |
| 2025-04 | 135 |
| 2025-08 | 78 |
| 2025-09 | 998 |
| 2025-10 | 1,146 |
| 2025-11 | 1,030 |
| 2026-01 | 300 |
| 2026-02 | 366 |
| 2026-03 | 530 |

### Pages By Type

| Type | Pages |
|---|---:|
| PDF | 8,330 |
| TXT | 237 |
| PPTX | 33 |

PDFs dominate the workload, so OCR/text extraction economics dominate Canvas import economics.

## Course Concentration

The top 3 courses account for 45.2% of queued pages. The top 5 account for 65.0%.

| Course | Files | Pages | Avg Pages/File | Share |
|---|---:|---:|---:|---:|
| 2425-CT102 Algorithms & Information Systems | 68 | 1,534 | 22.6 | 17.8% |
| 2425-CT103 Programming | 42 | 1,289 | 30.7 | 15.0% |
| 2526-MA284 Discrete Mathematics | 31 | 1,061 | 34.2 | 12.3% |
| 2526-CT216 Software Engineering I | 34 | 873 | 25.7 | 10.2% |
| 2526-CT230 Database Systems I | 25 | 830 | 33.2 | 9.7% |
| 2425-PH150 Introduction to Physics | 33 | 788 | 23.9 | 9.2% |
| 2526-CT2110 Digital Security and Media Programming | 21 | 454 | 21.6 | 5.3% |
| 2425-CT1114 Web Development | 19 | 344 | 18.1 | 4.0% |
| 2526-CT213 Computer Systems & Organization | 19 | 336 | 17.7 | 3.9% |
| 2526-CT2108 Networks and Data Communications 1 | 10 | 334 | 33.4 | 3.9% |
| 2526-ST2001 Statistics for Data Science 1 | 17 | 299 | 17.6 | 3.5% |
| 2526-CT248 Introduction to Modelling | 17 | 261 | 15.4 | 3.0% |
| 2425-MA190 Mathematics (Honours) | 5 | 110 | 22.0 | 1.3% |
| 2425-CT101 Computing Systems | 7 | 49 | 7.0 | 0.6% |
| 2425-CT1112 Professional Skills I | 3 | 38 | 12.7 | 0.4% |

Course selection should drive import warnings. A user importing all historical courses is materially different from a user importing one current module.

## Largest Files

Use these as concrete examples for import warnings, progress UI, retry handling, and import-credit copy.

| File | Course | Type | Pages | Size |
|---|---|---:|---:|---:|
| dictionary.txt | 2425-CT103 Programming | .txt | 211 | 776 KB |
| CT102_InfoSysSecurity.pdf | 2425-CT102 Algorithms & Information Systems | .pdf | 95 | 2.4 MB |
| ER-models_updated.pdf | 2526-CT230 Database Systems I | .pdf | 93 | 930 KB |
| ER-models.pdf | 2526-CT230 Database Systems I | .pdf | 86 | 829 KB |
| fileOrganisations.pdf | 2526-CT230 Database Systems I | .pdf | 82 | 641 KB |
| Physical Layer.pdf | 2526-CT2108 Networks and Data Communications 1 | .pdf | 76 | 4.6 MB |
| CT102_machine learning.pdf | 2425-CT102 Algorithms & Information Systems | .pdf | 72 | 3.9 MB |
| queryProcessing and Optimisation.pdf | 2526-CT230 Database Systems I | .pdf | 70 | 551 KB |
| quicksort.pdf | 2425-CT102 Algorithms & Information Systems | .pdf | 69 | 1.2 MB |
| Topic3_SQL and DDL.pdf | 2526-CT230 Database Systems I | .pdf | 66 | 1.8 MB |
| CT102_webSearch3_Preprocessing.pdf | 2425-CT102 Algorithms & Information Systems | .pdf | 65 | 1.4 MB |
| CT102_social_network_analysis.pdf | 2425-CT102 Algorithms & Information Systems | .pdf | 63 | 1.3 MB |
| CT102_recommender_systems.pdf | 2425-CT102 Algorithms & Information Systems | .pdf | 62 | 1.0 MB |
| CT103 Week 15_final.pdf | 2425-CT103 Programming | .pdf | 62 | 2.3 MB |
| ct2110_02.pdf | 2526-CT2110 Digital Security and Media Programming | .pdf | 61 | 664 KB |

## Methodology

- App mode mirrors Oghma Canvas import: active courses only, module File items, direct assignment attachments, and no course files/folder repository sweep.
- Marker/import-cost files are defined by the app processable filter: PDF, Word, PowerPoint, Markdown, and plain text.
- Module references and assignment/submission references are layered onto matching Canvas file IDs.
- Images count as one page.
- PPTX counts slides from `ppt/slides/slide*.xml`.
- Word document counts use Office or OpenDocument page metadata when present; otherwise a conservative 400 words/page estimate is used and flagged.
- Legacy `.ppt` without ZIP/XML metadata needs LibreOffice or another converter for reliable page counts.
- Daily, weekly, and monthly stats use Canvas `created_at` where available, then `updated_at`/`modified_at` as fallback.
- Recurring monthly estimates use Canvas file dates from the app-scoped corpus as a proxy for new monthly content arrival.
- GPU numbers are raw rental compute only and exclude engineering, storage, monitoring, retries, and quality-control overhead.
- Throughput assumptions: L4/conservative 1.16 pages/sec, RTX 4090/L40S 2.2 pages/sec, managed API 3.5 pages/sec, H100 25.0 pages/sec.
- Marker production readiness still needs benchmark, licensing, and operating-process validation before it becomes the default processing path.
