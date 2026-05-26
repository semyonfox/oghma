# OghmaNote — Pricing & Commercial Planning

> Last updated: 2026-05-21
> Based on real AWS billing data (Cost Explorer), live AWS pricing API, and Cohere API pricing.
> Payment processor: Polar (polar.sh) — Merchant of Record, handles EU VAT.
> Sister docs: `ROADMAP.md` (timeline) · `LAUNCH_CHECKLIST.md` (launch tasks). Operational/governance docs are kept private.
> Current live infrastructure: homelab Docker stack for prod + dev, with AWS retained for Route 53 and SES. Older AWS numbers below are retained as planning/reference material, not the current hosting bill.

---

## 1. AWS Cost Breakdown

### 1.1 Real Infrastructure Floor (GPU off, March 2026)

These costs run regardless of user activity:

| Service                               | $/day      | $/month         |
| ------------------------------------- | ---------- | --------------- |
| EC2-Other (EBS volumes, NAT gateway)  | ~$1.40     | ~$42            |
| AWS WAF                               | ~$0.63     | ~$19            |
| VPC / NAT Gateway                     | ~$0.63     | ~$19            |
| ALB (Marker load balancer)            | ~$0.60     | ~$18            |
| RDS (db.t3.micro, PostgreSQL)         | ~$0.54     | ~$16            |
| AWS Amplify (hosting + builds)        | ~$0.50     | ~$15            |
| ElastiCache (cache.t3.micro, Redis)   | ~$0.40     | ~$12            |
| ECS (Fargate, canvas-import-worker)   | ~$0.10     | ~$5             |
| Other (Secrets Manager, ECR, SES, S3) | ~$0.10     | ~$3             |
| **Floor total**                       | **~$4.40** | **~$149/month** |

### 1.2 GPU instances — live eu-west-1 prices (queried 2026-04-30)

Spot prices have ~doubled since the early 2026 baseline. Live numbers from `aws ec2 describe-spot-price-history` and `aws pricing get-products`:

| instance | GPU / VRAM | spot $/hr | on-demand $/hr | on-demand $/mo 24/7 | 1-yr RI no-upfront $/mo | 1-yr RI all-upfront $/mo (upfront $) |
|---|---|---|---|---|---|---|
| g4dn.xlarge | T4 16GB | ~$0.27 | $0.587 | ~$429 | ~$292 | not queried |
| **g5.xlarge** | **A10G 24GB** | **~$0.66** | **$1.123** | **~$820** | **~$516** | **~$482 ($5,784 upfront)** |
| g5.2xlarge | A10G 24GB | varies | varies | n/a | n/a | n/a |

**Note**: g6.xlarge (L4 GPU) is **not available in eu-west-1** as of April 2026 — closes off the L4 option for the GDPR-Ireland region.

**GPU specs**:

- A10G (g5): 24GB VRAM, ~62 TFLOPS FP16 dense — processes ~1–3 pages/sec for Marker
- T4 (g4dn): 16GB VRAM, ~30 TFLOPS FP16 — ~half throughput vs A10G, tight VRAM if running anything else on the same GPU

**Current ASG setup (as of April 2026)**:

- ASG: `<marker-asg>` in eu-west-1
- Instance: g5.xlarge spot (`<launch-template>`, version 22)
- No scheduled actions — pure scale-to-zero, desired=0 most of April (real spend ~$0 on GPU)
- GPU only runs when an import is triggered, cold start every time (~4–7 min)

**Status**: this ASG-based architecture is being deprecated for the back-to-school launch (see §1.5 below). Marker workload moves onto the launch instance directly.

### 1.3 Why Not a Bigger GPU?

All g5 variants (xlarge through 4xlarge) use **the same single A10G GPU**. Larger variants add CPU/RAM only. The g5.xlarge is the correct choice — going bigger costs 2-4x more for zero OCR throughput gain.

The only bigger GPU option is g5.12xlarge (4x A10G) at ~$16/hr = $11,500/month. Never.

### 1.4 Total Monthly Cost Scenarios — distributed AWS (legacy shape)

For the existing distributed architecture (Amplify + RDS + ElastiCache + ASG-based Marker GPU). Numbers updated to reflect live spot/on-demand prices as of 2026-04-30.

| GPU mode                  | fixed | GPU      | **total**       |
| ------------------------- | ----- | -------- | --------------- |
| scale-to-zero (current)   | $149  | ~$5–20   | **~$154–169**   |
| warm window (spot)        | $149  | ~$200    | **~$349**       |
| always-on (spot)          | $149  | ~$482    | ~$631           |
| always-on (on-demand)     | $149  | ~$820    | ~$969           |

**This shape is being retired.** The launch architecture (§1.5) collapses to a single self-hosted GPU instance, which is significantly simpler and ~$120/mo cheaper than always-on on-demand at the distributed shape.

### 1.5 Future AWS Upgrade Option — single g5.xlarge, self-hosted

**Status**: not the current live deployment. Prod and dev are already live on the homelab. This remains the simplest AWS upgrade option if revenue or reliability demands moving the homelab-shaped stack into eu-west-1.

**Architecture**: one EC2 g5.xlarge in eu-west-1 running the full stack via docker-compose — postgres, valkey/Redis, S3-compatible object storage, Next.js app, worker, Marker GPU. Mirrors the homelab compose stack.

**Why this shape won**:

- self-hosted (no marker API at €0.05/page — empirically unsustainable, see §2.2)
- always-warm GPU (no 4–7 min cold start, no spot eviction during launch demos)
- one box = mirror of homelab dev environment, minimal new ops surface
- cheaper than current distributed + on-demand always-on

**Cost stack if chosen** (with 1-yr RI all-upfront):

| line item | $/mo | notes |
|---|---|---|
| g5.xlarge 1-yr RI all-upfront (amortised) | $482 | $5,784 once → effective $/mo for 12 months |
| EBS gp3 250GB (postgres + s3-compat + models + logs) | ~$20 | 3,000 IOPS baseline included |
| EBS snapshots (daily, delta) | ~$5 | first snapshot full size, dailies are deltas |
| egress (trickle launch volume) | ~$2 | revisit if it climbs, CloudFront in front later |
| Route53 + SES | ~$0.50 | unchanged from current |
| **all-in** | **~$510** | with $5,784 upfront on RI commit day |

**RI alternatives**:

| structure | upfront | $/mo running | break-even vs on-demand |
|---|---|---|---|
| 1-yr RI all-upfront | $5,784 | $28 | month 4–5 |
| 1-yr RI no-upfront | $0 | $544 | from day 1 (~$300/mo saving vs on-demand) |
| on-demand 24/7 | $0 | $848 | n/a |

**RI commit rule**: only buy after on-demand smoke-testing the exact AWS box and after revenue justifies the commitment. Premature RI = locking before validating the box works.

---

## 2. API Costs

### 2.1 Cohere

| API                      | Price               | Per-user estimate                     |
| ------------------------ | ------------------- | ------------------------------------- |
| embed-multilingual-v3.0  | $0.10 / 1M tokens   | ~$0.01-0.05/month (negligible)        |
| rerank-multilingual-v3.0 | $2.00 / 1K searches | ~$0.20-$1.00/month (100-500 searches) |

**Rerank is the one to watch.** A heavy searcher doing 20 searches/day = $1.20/month. At 100 active users that's $120/month — budget accordingly.

Free trial key: ~1,000 calls/month (fine for development and handful of beta users).

### 2.2 Marker OCR — Self-Hosted vs API

| approach | cost per page | cost at 1K pages/mo |
|---|---|---|
| self-hosted GPU (launch arch §1.5) | ~$0.0006 | ~$0.60 |
| Marker API (datalab.to) | ~$0.04–0.10 | ~$40–100 |

**Empirical April 2026 test**: ~€5 burned through ~100 notes on the Marker API. Confirms the per-page rate and rules out the cloud API as a sustainable launch path — at 50 students × 100 notes/semester that's ~€2,500/semester just on OCR, which even €10/mo pricing cannot fund.

**Conclusion**: self-hosted GPU is the only viable launch architecture. Datalab API stays in the codebase as a fallback (`DATALAB_API_KEY` already supported) for emergencies when the GPU instance is down, not as the steady-state path.

Breakeven point is ~30–40 pages/month total — crossed by 4–5 active users. Above that, self-hosted is 70–175× cheaper per page.

---

## 3. Break-Even Analysis (Progressive Model)

Using Polar (polar.sh) as Merchant of Record — they handle EU VAT, we don't need to register for Irish VAT or file returns.

### Per-User Variable Cost

| component | €/active user/mo |
|---|---|
| Cohere rerank (avg 200 searches) | ~€0.40 |
| Cohere embed (new content) | ~€0.02 |
| Marker GPU time | ~€0.05–0.20 (on-demand, amortised) |
| S3 + bandwidth | ~€0.05 |
| **total variable** | **~€0.50–0.70** |

### Break-Even at €10/month (Standard tier)

- gross revenue/user: €10
- Polar fee (5%): −€0.50
- Cohere + GPU variable: ~−€0.60
- net contribution/user: ~**€8.90/mo**

### Break-Even at €20/month (Premium tier)

- gross: €20
- Polar fee (5%): −€1.00
- Cohere variable (heavier usage ~€1.50): ~−€1.50
- net contribution/user: ~**€17.50/mo**

### Break-Even by Infrastructure Tier

| Infra tier | Fixed cost | Standard users needed | Premium users needed |
|---|---|---|---|
| Tier 0 (now) | ~€6 | 1 | 1 |
| Tier 1 (warm window) | ~€175 | ~20 | ~10 |
| Tier 2 (24/7 small GPU) | ~€450 | ~51 | ~26 |
| Tier 3 (24/7 best GPU) | ~€900 | ~101 | ~52 |

**Model**: never upgrade infra until current tier is comfortably profitable. Each tier unlocks the next. No upfront RI commitment until Tier 2+ is justified by sustained revenue.

---

## 4. Pricing Tiers

### Free

- Manual note-taking, rich text editor, CodeMirror
- Spaced repetition (ts-fsrs)
- 5 AI searches/month (taste of the feature)
- No Canvas LMS import
- 500MB storage
- 1 vault

**Purpose:** acquisition funnel. Zero marginal cost per free user.

### Standard — €10/month or €79/year

- Canvas LMS import (2 courses, up to 300 pages/month)
- 250 AI semantic searches/month
- Full spaced repetition
- 3GB storage
- Standard OCR queue

### Premium — €20/month or €159/year

- Unlimited Canvas import
- Unlimited AI searches (rate-limited to prevent runaway Cohere costs)
- Priority OCR queue (jumps the queue, no monthly cap)
- 15GB storage
- Vault export (Obsidian/Markdown zip)
- Founder support — direct email line

> Note: at Tier 0 infra (§5.1), imports have a 4–7 min cold start while GPU spins up. Premium users get priority queueing but same cold start until revenue supports always-warm GPU (Tier 2+).

### University Licence — contact for pricing

- Per-institution site licence
- Canvas OAuth integration at institutional level
- Data residency documentation (GDPR)
- SSO (SAML 2.0 / OAuth 2.0)
- Potential white-label

---

## 5. Cost Trajectory

**Principle: scale infra with revenue, never ahead of it.** No month should end in the red. Infrastructure upgrades unlock when the previous month's revenue covers them.

### 5.1 Progressive Infrastructure Tiers

| Tier | Infra | ~Cost/mo | Users @ €10 | UX tradeoff |
|------|-------|----------|-------------|-------------|
| **0 (now)** | Live homelab + Route 53/SES + external AI/OCR usage | ~€0.50 base + usage | 1 | Single-site homelab reliability; OCR depends on configured fallback/Marker |
| **1** | Homelab plus paid/offsite backup and monitoring | ~€10-30 | 2-4 | Better recovery/alerting, same compute limits |
| **2** | Managed database/object storage or warm GPU window | ~€150-250 | ~20-30 | Reduces one-box risk or OCR cold starts |
| **3** | Always-warm GPU / managed production stack | ~€450-900 | ~51-101 | Better reliability and OCR latency; higher fixed bill |

Each tier unlocks when monthly revenue reliably covers it. Tier 0 is sustainable indefinitely with even a handful of paying users.

### 5.2 Current State (May 2026)

| period | infra | cost/mo | notes |
|---|---|---|---|
| Now | Homelab Docker stack + AWS Route 53/SES | ~€0.50 base + provider usage | prod + dev are live on homelab |
| When revenue supports | Tier 1–3 as above | €10–900 | upgrade only when covered |

**For the product/feature phase plan** (controlled beta → soft launch → paid cohort growth), see `ROADMAP.md`. This doc focuses on cost; the roadmap focuses on what we ship in each phase.

---

## 6. Key Risks Before Public Launch

| Risk                       | Severity   | Mitigation                                                                                                                             |
| -------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **AWS credit expiry**      | Resolved   | Credits expired April 5 2026. Real spend now ~€6/mo on minimal infra.                                                                  |
| **Cold-start UX**          | Accepted   | 4–7 min GPU spin-up at Tier 0. Mitigate with clear "processing" UI. Resolves at Tier 2+ when revenue supports always-warm GPU.         |
| **GDPR**                   | High       | Irish jurisdiction, all EU users in scope. Need privacy policy, DPA, data residency docs. AWS eu-west-1 (Ireland) satisfies residency. |
| **Cost spike**             | Low        | Progressive model (§5.1) means costs only rise with revenue. On-demand GPU = pay only for usage. No RI commitment until justified.     |
| **Canvas ToS**             | Medium     | Using OAuth with user credentials is legitimate. Watch for institution-level API restrictions.                                         |
| **Cohere rerank at scale** | Medium     | 500 daily active users each doing 20 searches = €600/month in rerank alone. Cache results where possible. Per-tier caps prevent runaway. |
| **Spot interruption**      | Low–Medium | Tier 1–2 use spot instances. Interruption during import = retry from checkpoint. Upgrade to on-demand (Tier 3) when revenue supports. |

---

## 7. Current Infrastructure State (May 2026)

The distributed AWS app stack has been replaced by the homelab deployment. AWS remains for DNS/email and as future capacity planning reference.

| Resource        | Name / ID                  | Region    | Status                      | Fate                          |
| --------------- | -------------------------- | --------- | --------------------------- | ----------------------------- |
| App hosting     | homelab Docker/Jenkins     | home server | Active                    | **current prod/dev host**     |
| PostgreSQL      | `oghma-postgres`           | homelab   | Active                      | **current DB**                |
| Redis           | `oghma-redis`              | homelab   | Active                      | **current queue/cache**       |
| RustFS          | `oghma-rustfs`             | homelab   | Active                      | **current object storage**    |
| Route53 zone    | `oghmanotes.ie`            | global    | Active                      | **keep**                      |
| SES             | sending identity           | eu-west-1 | Active                      | **keep**                      |

### Future GPU Scaling Actions

The old Marker ASG is not the live homelab path. Keep these commands only as reference if an AWS Marker ASG is recreated later.

To add a warm window later:

```bash
# scale up 08:00 IST (07:00 UTC)
aws autoscaling put-scheduled-update-group-action \
  --auto-scaling-group-name <marker-asg> \
  --scheduled-action-name marker-scale-up-morning \
  --recurrence "0 7 * * *" \
  --min-size 1 --max-size 2 --desired-capacity 1 \
  --region eu-west-1

# scale down 23:00 IST (22:00 UTC)
aws autoscaling put-scheduled-update-group-action \
  --auto-scaling-group-name <marker-asg> \
  --scheduled-action-name marker-scale-down-night \
  --recurrence "0 22 * * *" \
  --min-size 0 --max-size 2 --desired-capacity 0 \
  --region eu-west-1
```

---

## 8. Quick Reference — AWS CLI

```bash
# check GPU status
aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-name <marker-asg> \
  --region eu-west-1 \
  --query 'AutoScalingGroups[0].{Desired:DesiredCapacity,Min:MinSize,Instances:Instances[*].LifecycleState}'

# manually scale GPU up (e.g. for testing)
aws autoscaling set-desired-capacity \
  --auto-scaling-group-name <marker-asg> \
  --desired-capacity 1 \
  --region eu-west-1

# manually scale GPU down (stop the bill)
aws autoscaling set-desired-capacity \
  --auto-scaling-group-name <marker-asg> \
  --desired-capacity 0 \
  --region eu-west-1

# disable warm window (keep scale-to-zero only)
aws autoscaling delete-scheduled-action \
  --auto-scaling-group-name <marker-asg> \
  --scheduled-action-name marker-scale-up-morning \
  --region eu-west-1

# re-enable warm window
aws autoscaling put-scheduled-update-group-action \
  --auto-scaling-group-name <marker-asg> \
  --scheduled-action-name marker-scale-up-morning \
  --recurrence "0 7 * * *" \
  --min-size 1 --max-size 2 --desired-capacity 1 \
  --region eu-west-1

# check this month's real spend (before credits)
aws ce get-cost-and-usage \
  --time-period Start=$(date +%Y-%m-01),End=$(date +%Y-%m-%d) \
  --granularity MONTHLY \
  --metrics UnblendedCost \
  --filter '{"Dimensions":{"Key":"RECORD_TYPE","Values":["Usage"]}}' \
  --region eu-west-1
```
