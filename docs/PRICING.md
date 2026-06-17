# OghmaNotes Pricing And Cost Plan

Last updated: 2026-06-15 (Canvas import pricing report and launch hosting target added). Values are planning estimates; recheck provider pricing before making spend or billing decisions.

Payment processor decision: [PAYMENT_PROCESSOR_DECISION.md](PAYMENT_PROCESSOR_DECISION.md). Current choice is Stripe Managed Payments for the first paid subscriptions.

Canvas import economics source of truth: [CANVAS_IMPORT_PRICING_REPORT.md](CANVAS_IMPORT_PRICING_REPORT.md).

## Current Position

| Area | Current state |
|---|---|
| Hosting | Homelab Docker stack for prod and dev today; launch target is Cloudflare DNS/edge/email/R2, Neon Postgres + pgvector, and a Node/Docker worker/app fallback runtime unless the OpenNext web trial is clean |
| AWS | Historical/fallback only unless explicitly retained |
| Email | Cloudflare Email Sending target; Google Workspace for human inboxes |
| Base infra cost | Homelab is cheap but ISP-limited; launch hosting costs move to provider trials |
| Paid launch product | Standard at EUR 10/month |
| Future paid products | Premium and annual pricing are modelled but should stay disabled until usage is proven |

## Pricing Tiers

### Free

- Manual note-taking and rich-text / markdown editing
- Spaced repetition
- Small AI search allowance
- No Canvas import
- Limited storage and one vault

Purpose: acquisition and product feedback with minimal marginal cost.

### Standard: EUR 10/month

- Canvas LMS import
- AI semantic search / chat allowance
- Full spaced repetition
- Larger storage allowance
- Standard OCR/indexing queue

This is the only paid tier that should launch first.

### Premium: Future Tier

The public pricing page currently shows EUR 18/month as a placeholder future tier. Do not enable checkout until usage limits, support load, and real demand are clearer.

Potential differentiators:

- Higher Canvas import and AI limits
- Priority OCR/indexing
- Larger storage
- Vault export/import convenience features
- Direct founder support

### Annual / Academic-Year Option

Students churn over the summer: cancel in May, maybe resubscribe in September. An annual plan around EUR 80-90 (roughly two months free) captures the summer, smooths cashflow, and is trivial to add in Stripe. This is likely a stronger upsell than pushing people from Standard to Premium.

### University Licence

Manual sales path for institution deals. Requires data residency docs, procurement-ready terms, SSO/Canvas OAuth posture, and likely B2B invoicing.

## Tier Design Notes

- Three visible tiers with the bottom one **free**, not a cheap paid taster. A ~EUR 5 tier would pay the worst Stripe MoR percentage, attract the highest-churn/highest-support users, and cannibalise Standard signups; the free tier already does the decoy ladder's bottom-rung job.
- Price is set by what students will pay (EUR 10, anchored against ChatGPT's EUR 8 entry tier). Do not undercut to EUR 8 — that positions Oghma as a discount chatbot. The pitch is "cheaper than a ChatGPT sub *and* has your actual course notes inside". Costs are made to fit under the price via limits and model routing, never by raising Standard.
- Premium differentiates on limits only (more OCR pages, more AI, priority queue) so it costs nothing extra to maintain.
- If upsell pressure toward Premium is ever wanted, the lever is the price gap: EUR 10 vs EUR 18 reads as "double, no thanks"; a narrower gap pushes harder. At launch, though, bodies on Standard beat ARPU — word-of-mouth inside a university compounds.
- Launch-week promo: Premium for the price of Standard, first month, time-boxed.
- The three selectable chat models differ ~3x in cost (DeepSeek vs Kimi). Keep the message cap identical across models rather than inventing credits — users who pick the cheap model quietly improve margin.
- AI usage should use a weighted allowance, not raw request counts. A low-cost default model can count as 1x while a more expensive model counts at a higher multiplier, such as 4x if the actual provider cost ratio supports it.

## Unit Economics

Estimated Standard contribution at EUR 10/month:

| Item | Estimate |
|---|---:|
| Gross subscription | EUR 10.00 |
| Stripe Managed payment/MoR fee | about EUR 0.82 |
| AI/OCR/storage variable cost | target below EUR 1 for normal recurring use, excluding unusually large onboarding backlogs |
| Net contribution | about EUR 8.50/month |

The main risk is not ordinary hosting. It is uncapped import/OCR, reranking, and high-cost AI model usage.

The old rough import-cost model has been replaced by the Canvas audit. At managed API pricing, the observed first import would cost $302.55 and the average recurring run-rate would cost $21.60/month. That makes managed document APIs unsuitable as the steady-state import path. On-demand GPU batching is the intended margin-protection path.

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
- GPU rental pricing and provider billing minimums for H100, L4, 4080/4090, and L40S-class machines
- Stripe Managed Payments and Ireland pricing
- LLM, embedding, rerank, and OCR provider pricing
- Google Workspace pricing for founder inboxes
- AWS `eu-west-1`, Route 53, and SES billing only if AWS is explicitly retained or reintroduced
- Any Merchant-of-Record policy restrictions for education/study software
