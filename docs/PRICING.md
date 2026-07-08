# OghmaNotes Pricing And Cost Plan

Last updated: 2026-06-18 (measured homelab storage/database footprint, R2 cost model, and Neon launch database cost model added). Values are planning estimates; recheck provider pricing before making spend or billing decisions.

Payment processor decision: [PAYMENT_PROCESSOR_DECISION.md](PAYMENT_PROCESSOR_DECISION.md). Current choice is Stripe Managed Payments for the first paid subscriptions.

Canvas import economics source of truth: [CANVAS_IMPORT_PRICING_REPORT.md](CANVAS_IMPORT_PRICING_REPORT.md).

## Current Position

| Area | Current state |
|---|---|
| Hosting | Homelab Docker stack for prod and dev today; launch target is Cloudflare DNS/edge/email/R2, Neon Postgres + pgvector, and a Node/Docker worker/app fallback runtime unless the OpenNext web trial is clean |
| AWS | Historical/fallback only unless explicitly retained |
| Email | Cloudflare Email Sending target; Google Workspace for human inboxes |
| Base infra cost | Homelab is cheap but ISP-limited; launch hosting costs move to provider trials |
| Paid launch product | Semester-first student plan, final price likely EUR 39-49/semester |
| Future paid products | Academic-year pricing and monthly fallback are modelled but should stay disabled until usage is proven |

## Pricing Tiers

### Free First Import

- Manual note-taking and rich-text / markdown editing
- Spaced repetition
- Small AI search allowance
- Limited first Canvas import or one-module import
- Limited storage and one vault

Purpose: acquisition and product feedback by showing the core "semester appears" moment before payment. This must stay limited because Canvas OCR/indexing is the margin-sensitive path.

### Semester: Planning Range EUR 39-49/semester

- Canvas LMS import
- AI semantic search / chat allowance
- Full spaced repetition
- Larger storage allowance
- Standard OCR/indexing queue

This is the preferred public paid framing because students think in semesters and exam seasons, not SaaS billing cycles. Keep the allowance model explicit: recurring page allowance, separate onboarding allowance, and large-import confirmation.

### Monthly: Fallback

Monthly pricing can exist as a fallback, but it should not be the main public anchor. A generic EUR 10/month pitch makes OghmaNotes look like another AI subscription instead of a semester study system.

### Premium / Heavier Usage: Future Tier

Do not enable checkout until usage limits, support load, and real demand are clearer.

Potential differentiators:

- Higher Canvas import and AI limits
- Priority OCR/indexing
- Larger storage
- Vault export/import convenience features
- Direct founder support

### Annual / Academic-Year Option

Students churn over the summer: cancel in May, maybe resubscribe in September. An annual plan around EUR 80-90 captures the summer, smooths cashflow, and is likely a stronger upsell than pushing people from Standard to Premium.

### University Licence

Manual sales path for institution deals. Requires data residency docs, procurement-ready terms, SSO/Canvas OAuth posture, and likely B2B invoicing.

## Tier Design Notes

- Three visible tiers with the bottom one **free**, not a cheap paid taster. A ~EUR 5 tier would pay the worst Stripe MoR percentage, attract the highest-churn/highest-support users, and cannibalise Standard signups; the free tier already does the decoy ladder's bottom-rung job.
- Price is set by what students will pay for a semester outcome, not by generic AI subscription anchoring. The pitch is "your actual semester organised", not "a cheaper chatbot". Costs are made to fit under the price via limits, import allowances, batching, and model routing.
- Premium differentiates on limits only (more OCR pages, more AI, priority queue) so it costs nothing extra to maintain.
- If upsell pressure toward heavier-usage tiers is ever wanted, the lever is the price gap and allowance design. At launch, activated student users beat ARPU because word-of-mouth inside a university compounds.
- Launch-week promo: Premium for the price of Standard, first month, time-boxed.
- The three selectable chat models differ ~3x in cost (DeepSeek vs Kimi). Keep the message cap identical across models rather than inventing credits — users who pick the cheap model quietly improve margin.
- AI usage should use a weighted allowance, not raw request counts. A low-cost default model can count as 1x while a more expensive model counts at a higher multiplier, such as 4x if the actual provider cost ratio supports it.

## Unit Economics

Estimated monthly-equivalent contribution for a paid student plan:

| Item | Estimate |
|---|---:|
| Gross monthly-equivalent subscription | About EUR 10.00 |
| Stripe Managed payment/MoR fee | about EUR 0.82 |
| AI/OCR/storage variable cost | target below EUR 1 for normal recurring use, excluding unusually large onboarding backlogs |
| Net contribution | about EUR 8.50/month |

The main risk is not ordinary hosting. It is uncapped import/OCR, reranking, and high-cost AI model usage.

The old rough import-cost model has been replaced by the Canvas audit. At managed API pricing, the observed first import would cost $302.55 and the average recurring run-rate would cost $21.60/month. That makes managed document APIs unsuitable as the steady-state import path. On-demand GPU batching is the intended margin-protection path.

## Measured Storage And Database Footprint

Measured on 2026-06-18 from the homelab RustFS bucket and local PostgreSQL databases. This is still early/test data: effectively one heavy note-taking CS student plus a few friend/test accounts, not a mature production cohort.

The measured heavy user is a computer science student roughly 2 years into a 4-year degree. CS has more lecture/document volume than many courses, but a 4th/5th-year engineering student with accumulated historical Canvas imports could plausibly be 2x-3x this storage footprint. Treat this as a useful lower-to-mid planning anchor, not a maximum.

### Current Homelab Footprint

| Store | Size | Notes |
|---|---:|---|
| RustFS/S3-compatible object bucket `oghma-notes` | ~1.2 GB | Mostly prod `oghma/` Canvas files, vault zips, exports, notes, and avatars |
| PostgreSQL `oghma` | 341 MB | Dominated by 4096-dimensional embeddings |
| PostgreSQL `oghma_dev` | 10 MB | Small dev/test database |

### Object Storage Breakdown

| Prefix | Size | Planning read |
|---|---:|---|
| `oghma/canvas` | 896.6 MiB | Main object-storage driver |
| `oghma/vault-uploads` | 167.0 MiB | Large one-off zip imports |
| `oghma/exports` | 92.3 MiB | Vault exports; likely cleanup/expiry candidate |
| `oghma/notes` | 29.3 MiB | Uploaded note PDFs/attachments and markdown-backed objects |
| `oghma/avatars` | 3.8 MiB | Negligible |
| `oghma-dev/canvas` | 1.7 MiB | Negligible |
| settings | tiny | Negligible |

### Database Breakdown

| Database table group | Size | Planning read |
|---|---:|---|
| `app.embeddings` in prod | 304 MB | 15,341 vectors; each 4096-dim vector row is roughly 16-20 KB including storage overhead |
| `app.chunks` in prod | 11 MB | 15,341 text chunks |
| `app.notes` in prod | 12 MB | 2,021 notes/folders and extracted text |
| Other prod tables | <5 MB combined | Tree, attachments, Canvas job metadata, quiz/chat/planner/auth tables |

Embeddings are the database growth driver. Object storage is cheap; vector rows and query performance are the database capacity concern.

### Cloudflare R2 Cost At This Footprint

Cloudflare R2 Standard pricing checked 2026-06-18:

| R2 item | Included monthly | Paid rate |
|---|---:|---:|
| Standard storage | 10 GB-month | $0.015 / GB-month |
| Class A operations, writes/lists | 1M | $4.50 / million |
| Class B operations, reads | 10M | $0.36 / million |
| Internet egress | Free | Free |

At the current ~1.2 GB object footprint, R2 storage is inside the free tier. Without the free tier, it would be about $0.02/month.

Rough object-storage scale, using the current heavy-test-user footprint:

| Heavy-user equivalent | Object storage | R2 storage cost |
|---:|---:|---:|
| 1 | ~1.2 GB | Free |
| 10 | ~12 GB | ~$0.03/month after free tier |
| 100 | ~120 GB | ~$1.65/month |
| 1,000 | ~1.2 TB | ~$18/month |

Conservative planning for heavier senior engineering students:

| User type | Object-storage planning range | R2 storage cost/user |
|---|---:|---:|
| Light/manual notes user | 0.1-0.5 GB | <$0.01/month |
| Normal active Canvas user | 0.5-1.5 GB | ~$0.01-$0.02/month |
| Heavy CS user, mid-degree | ~1.2 GB observed | ~$0.02/month before free tier |
| Heavy 4th/5th-year engineering user | 2.5-4 GB | ~$0.04-$0.06/month |
| Extreme/import-everything user | 5-10 GB | ~$0.08-$0.15/month |

Storage alone is not a meaningful Standard-tier margin risk. The real risks are OCR/import processing, AI usage, database growth from embeddings, and operational cleanup of stale vault import/export zips.

### Neon Postgres Cost And Connection Plan

Neon is the preferred first managed PostgreSQL + pgvector target because it preserves the current Postgres schema and vector model with much less rewrite risk than a MariaDB pivot. Use the pooled Neon connection directly from normal Node runtimes, and use Cloudflare Hyperdrive only for application code that actually runs inside Cloudflare Workers/OpenNext.

| Runtime | Database path | Planning read |
|---|---|---|
| Current Node/Docker app | Direct Neon pooled connection | Simplest path; no extra Cloudflare database hop needed |
| BullMQ/Node worker | Direct Neon pooled connection | Keep the long-running worker outside Hyperdrive |
| Cloudflare Workers/OpenNext app | Cloudflare Hyperdrive to Neon | Useful for edge connection pooling and Worker connection setup |

Neon pricing checked 2026-06-18 for Free and Launch-plan planning:

| Neon item | Planning rate |
|---|---:|
| Free plan storage | 0.5 GB per project |
| Free plan compute | 100 CU-hours/month per project |
| Compute | $0.106 / CU-hour |
| Storage | $0.35 / GB-month |
| Current prod DB storage, 341 MB | Fits under the Free plan storage cap today |

The current production database is small enough for Neon's Free storage allowance by size, but Free should be treated as a beta/prototype envelope, not the paid-launch production plan. It has a hard 0.5 GB project storage cap, limited compute allowance, short restore window, and fewer operational controls. Launch-plan pricing is still the right model for public paid launch.

Scale-to-zero stops compute billing after inactivity while storage continues to bill on paid plans. Free and Launch default to a short inactivity timeout; Launch can disable scale-to-zero. Neon advertises wake from idle as typically a few hundred milliseconds, but product planning should assume the first real app request after idle may feel about 0.5-2 seconds slower once network, app, connection, and cache effects are included.

Approximate 24/7 compute cost at Launch rates:

| Always-on compute | RAM | Compute cost |
|---:|---:|---:|
| 0.25 CU | 1 GB | ~$19.35/month |
| 0.5 CU | 2 GB | ~$38.69/month |
| 1 CU | 4 GB | ~$77.38/month |

Recommended posture: allow scale-to-zero during closed beta/testing, then budget for the smallest always-on compute that benchmarks cleanly before paid users rely on lecture-time note access. At current size, compute dominates storage cost; vector table growth is the capacity/performance item to watch.

### Qdrant Vector Storage Cost Check

Qdrant pricing checked 2026-06-18. This section covers vector storage/search only, not Qdrant Cloud Inference or any embedding-generation cost.

The current prod embedding footprint is small by dedicated vector-database standards:

| Current embedding metric | Value |
|---|---:|
| Embedding rows | 15,341 |
| Vector dimensions | 4,096 |
| Raw float32 vector bytes | ~251 MB decimal / ~240 MiB |
| Current PostgreSQL `app.embeddings` table | 304 MB |

Qdrant supports 4,096-dimensional dense vectors; its documented dense-vector maximum is much higher than this. The current vector count and raw vector size should fit comfortably inside Qdrant Cloud's Free Tier resource envelope for testing/prototyping:

| Qdrant Cloud item | Published planning value |
|---|---:|
| Free Tier RAM | 1 GB |
| Free Tier vCPU | 0.5 vCPU |
| Free Tier disk | 4 GB |
| Standard Tier | Usage-based dedicated resources |
| Paid billing basis | CPU, memory, cluster disk, backup disk, and optional inference tokens |

Qdrant does not publish a simple public "$/GB of vectors" price in the main pricing page. Paid Standard estimates need the Qdrant Cloud calculator because cost depends on chosen CPU, RAM, disk, backups, cloud/region, node count, and HA posture. For OghmaNotes, the important planning read is that the current 15k x 4096-dim vector corpus is still free-tier/prototype-sized; production use would be chosen for isolation, SLA, HA, and predictable search performance rather than because today's vector storage volume forces it.

Operational caveat: Qdrant would not replace PostgreSQL. It would add a separate vector index/service that must be kept in sync with `notes`, `chunks`, permissions, deletes, and imports. Use it only if pgvector query latency or index maintenance becomes the bottleneck under measured load.

## Infrastructure Upgrade Tiers

Principle: upgrade only after the previous month can pay for the next tier.

| Tier | Shape | Approx cost/mo | Trigger |
|---|---|---:|---|
| 0 | Homelab + external providers | Very low base + usage | Current interim state |
| 1 | Cloudflare + Neon + R2 + small Node runtime | Provider-trial dependent | ISP/reliability requires migration off homelab |
| 2 | On-demand GPU batches | Queue volume / onboarding cohorts | First import backlogs need fast processing |
| 3 | Longer GPU worker windows or mostly-busy 4080/4090 | Sustained queue demand | Revenue and queue volume justify it |
| 4 | Dedicated GPU or larger managed stack | High sustained demand | GPU can be kept busy most of the time |

## OCR Cost Reality

OCR is the cost-sensitive path.

| Approach | Planning read |
|---|---|
| On-demand rented GPU | Lowest realistic per-page cost once batched |
| Managed document API / Datalab | Too expensive for steady-state Canvas imports at observed page volume |
| Fallback text extraction | Cheap and useful for digital-native PDFs, but lower quality for scanned/image-heavy PDFs |

Keep the product copy honest: OCR/indexing can take minutes, especially if jobs wait for a batch window or fallback extraction is used.

### Month-1 Import Spike Control

New users may ingest their whole Canvas history up front. The measured sample was 8,603 pages and would cost $302.55 through the managed API model, versus about $0.28/user in raw H100 compute if batched. Generous onboarding limits still need controls because compute is not the only cost: quality checks, retries, monitoring, storage, and queue operations matter.

- Route digital-native (non-scanned) PDFs through plain text extraction; only scanned/image-heavy documents go to Marker.
- Make the generous import allowance a **one-time onboarding boost**, not a monthly limit. Planning default: 2,000-3,000 onboarding pages before approval, deferral, or credits.
- Start the recurring Standard allowance around 1,000 Canvas pages/month, then adjust from real user data.
- Use priority queueing and higher monthly usage limits for higher paid tiers rather than maintaining different feature sets.
- Free tier gets no Canvas import at all (above) — the most expensive feature stays paid.

## Legacy AWS Reference

The retired distributed AWS shape had a fixed floor around USD 149/month before GPU usage. It included Amplify, RDS, ElastiCache, NAT/VPC, ALB/WAF, ECS worker, Secrets Manager, ECR, SES, and S3.

A future AWS rebuild should mirror the current homelab shape unless there is a strong reason not to. The simplest modelled upgrade was a single `g5.xlarge` in `eu-west-1` running app, worker, PostgreSQL, Redis, object storage, and Marker via Docker Compose. Existing notes estimated roughly USD 510/month with a 1-year reserved-instance commitment, but this must be rechecked before use.

Do not buy reserved capacity until:

- the exact box has been smoke-tested on demand,
- OCR/import demand is real,
- monthly revenue comfortably covers the commitment,
- backup and recovery are documented.

## Launch Risks

| Risk | Mitigation |
|---|---|
| GDPR/compliance | Publish privacy policy and ToS before launch; keep deletion/export flows working |
| Provider usage spike | Cap AI and OCR by tier; monitor rerank/OCR usage |
| Homelab beta reliability | Add uptime, disk, DB, and container alerts while beta users are still on the interim stack |
| Launch provider migration | Load-test OpenNext/runtime, Neon, R2, Redis/BullMQ, email, and GPU batches before moving paid users |
| Cold-start UX | Show clear processing copy and avoid promising instant indexing |
| Payment complexity | Start with one Standard product and Stripe Managed webhooks |

## Sources To Recheck

- [Canvas import pricing report](CANVAS_IMPORT_PRICING_REPORT.md) before changing import allowances or GPU strategy
- [Target hosting plan](../infra/TARGET_HOSTING.md) before changing provider split
- Cloudflare Email Sending, R2, Workers/OpenNext, and Hyperdrive pricing/limits
- Neon Postgres, pgvector, storage, compute, branching, and connection-pooling limits
- Qdrant Cloud pricing calculator, free tier resources, and paid resource model if a dedicated vector service is reconsidered
- GPU rental pricing and provider billing minimums for H100, L4, 4080/4090, and L40S-class machines
- Stripe Managed Payments and Ireland pricing
- LLM, embedding, rerank, and OCR provider pricing
- Google Workspace pricing for founder inboxes
- AWS `eu-west-1`, Route 53, and SES billing only if AWS is explicitly retained or reintroduced
- Any Merchant-of-Record policy restrictions for education/study software
