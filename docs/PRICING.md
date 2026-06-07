# OghmaNotes Pricing And Cost Plan

Last updated: 2026-06-07. Values are planning estimates; recheck provider pricing before making spend or billing decisions.

Payment processor decision: [PAYMENT_PROCESSOR_DECISION.md](PAYMENT_PROCESSOR_DECISION.md). Current choice is Stripe Managed Payments for the first paid subscriptions.

## Current Position

| Area | Current state |
|---|---|
| Hosting | Homelab Docker stack for prod and dev |
| AWS | Route 53, SES, and any explicitly documented external service |
| Base infra cost | Approximately EUR 0.50/month plus provider usage |
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

### University Licence

Manual sales path for institution deals. Requires data residency docs, procurement-ready terms, SSO/Canvas OAuth posture, and likely B2B invoicing.

## Unit Economics

Estimated Standard contribution at EUR 10/month:

| Item | Estimate |
|---|---:|
| Gross subscription | EUR 10.00 |
| Stripe Managed payment/MoR fee | about EUR 0.82 |
| AI/OCR/storage variable cost | about EUR 0.50-0.70 |
| Net contribution | about EUR 8.50/month |

At the current homelab tier, one paying user covers the fixed hosting bill. The main risk is not fixed infra; it is runaway provider usage from OCR, reranking, or uncapped AI features.

## Infrastructure Upgrade Tiers

Principle: upgrade only after the previous month can pay for the next tier.

| Tier | Shape | Approx cost/mo | Trigger |
|---|---|---:|---|
| 0 | Homelab + Route 53/SES + external providers | EUR 0.50 base + usage | Current state |
| 1 | Homelab plus offsite backup/monitoring | EUR 10-30 | First real users |
| 2 | Managed DB/object storage or warm OCR/GPU window | EUR 150-250 | Reliability or cold-start pain is proven |
| 3 | Always-warm GPU or managed production stack | EUR 450-900 | Revenue reliably covers it |

## OCR Cost Reality

OCR is the cost-sensitive path.

| Approach | Planning read |
|---|---|
| Self-hosted GPU | Lowest per-page cost once usage exists |
| Datalab/Marker API | Useful fallback, too expensive as steady-state OCR for active cohorts |
| Homelab fallback extraction | Cheap, but lower quality for scanned/image-heavy PDFs |

Keep the product copy honest: OCR/indexing can take minutes at Tier 0, especially if Marker is cold, unavailable, or using fallback extraction.

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
| Homelab reliability | Add uptime, disk, DB, and container alerts before inviting users |
| Cold-start UX | Show clear processing copy and avoid promising instant indexing |
| Payment complexity | Start with one Standard product and Stripe Managed webhooks |

## Sources To Recheck

- Stripe Managed Payments and Ireland pricing
- LLM, embedding, rerank, and OCR provider pricing
- AWS `eu-west-1` EC2/GPU, storage, snapshot, and bandwidth pricing
- Route 53 and SES billing
- Any Merchant-of-Record policy restrictions for education/study software
