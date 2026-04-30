# OghmaNote — Pricing & Commercial Planning

> Last updated: 2026-04-30
> Based on real AWS billing data (Cost Explorer), live AWS pricing API, and Cohere API pricing.
> Sister docs: `ROADMAP.md` (timeline) · `LAUNCH_CHECKLIST.md` (launch tasks). Operational/governance docs are kept private.

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

### 1.5 Launch Infrastructure — single g5.xlarge, self-hosted (post-homelab)

**Architecture**: one EC2 g5.xlarge in eu-west-1 running the full stack via docker-compose — postgres, valkey, garage/S3, Next.js app, worker, Marker GPU. Mirrors the homelab compose stack so summer-tested config lifts directly onto AWS pre-launch.

**Why this shape won**:

- self-hosted (no marker API at €0.05/page — empirically unsustainable, see §2.2)
- always-warm GPU (no 4–7 min cold start, no spot eviction during launch demos)
- one box = mirror of homelab dev environment, minimal new ops surface
- cheaper than current distributed + on-demand always-on

**Cost stack — launch month onward** (with 1-yr RI all-upfront committed in mid-Aug):

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

**RI commit timing**: buy in mid-August, **after** 2 weeks of on-demand smoke-testing on AWS. Premature RI = locking before validating the box works.

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

**Empirical April 2026 test**: ~€5 burned through ~100 notes on the Marker API. Confirms the per-page rate and rules out the cloud API as a sustainable launch path — at 50 students × 100 notes/semester that's ~€2,500/semester just on OCR, which the €4.99/mo Student tier cannot fund.

**Conclusion**: self-hosted GPU is the only viable launch architecture. Datalab API stays in the codebase as a fallback (`DATALAB_API_KEY` already supported) for emergencies when the GPU instance is down, not as the steady-state path.

Breakeven point is ~30–40 pages/month total — crossed by 4–5 active users. Above that, self-hosted is 70–175× cheaper per page.

---

## 3. Break-Even Analysis (Launch Architecture, Full Stack)

Old break-even assumed a $254/mo distributed-AWS warm-window config and ignored Stripe fees. Updated for the launch arch (§1.5) at €510/mo with Stripe fees and Cohere baked in.

### Per-User Variable Cost

| component | $/active user/mo |
|---|---|
| Cohere rerank (avg 200 searches) | ~$0.40 |
| Cohere embed (new content) | ~$0.02 |
| Marker GPU time (already in §1.5 fixed) | $0.00 — fixed cost |
| S3 + bandwidth | ~$0.05 |
| **total variable** | **~$0.50** |

### Break-Even at €4.99/month (Student tier)

- gross revenue/user: €4.99
- Stripe fees (~8% effective on €4.99): −€0.40
- Cohere variable: ~−€0.45 (avg user)
- net contribution/user: ~**€4.14/mo**
- launch fixed cost: **€480/mo** ($510 ≈ €480)
- **break-even: ~116 paid Student users**

### Break-Even at €9.99/month (Pro tier)

- gross: €9.99
- Stripe fees: −€0.85
- Cohere variable (Pro is unlimited search, assume heavier ~€1.20): ~−€1.20
- net contribution/user: ~**€7.94/mo**
- **break-even: ~61 paid Pro users**

### Mixed Cohort Break-Even

| mix | revenue (gross) | net (after Stripe + Cohere) | net result vs €480 launch fixed |
|---|---|---|---|
| 100 Student | €499 | €414 | **−€66** |
| 120 Student | €599 | €497 | **+€17** |
| 80 Student + 20 Pro | €599 | €490 | **+€10** |
| 50 Student + 30 Pro | €549 | €477 | **−€3** |
| 40 Student + 40 Pro | €600 | €516 | **+€36** |

**Realistic break-even target**: ~120 Student or ~55 Pro or ~80/20 mix. Higher than the €254/mo doc's old quote because (a) launch fixed cost is ~2× now and (b) Stripe fees are real.

> Recommendation: pre-launch summer runs on homelab at ~€0.50/mo to preserve the runway fund. AWS launch arch (§1.5) commits in mid-August, RI in mid-August after smoke-test, real spend kicks in September.

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

### Student — €4.99/month or €39/year

- Canvas LMS import (2 courses, up to 300 pages/month)
- 250 AI semantic searches/month
- Full spaced repetition
- 3GB storage
- Standard OCR queue (rate-limited if heavy load)

### Pro — €9.99/month or €79/year

- Unlimited Canvas import
- Unlimited AI searches (rate-limited to prevent runaway Cohere costs)
- Priority OCR queue (jumps the queue, no monthly cap)
- 15GB storage
- Vault export (Obsidian/Markdown zip)
- Founder support — direct email line

> Note: launch arch (§1.5) is always-warm for all tiers. The "warm GPU window" differentiator from earlier drafts is gone — Pro differentiates on caps, priority queueing, and direct support, not on GPU availability.

### University Licence — contact for pricing

- Per-institution site licence
- Canvas OAuth integration at institutional level
- Data residency documentation (GDPR)
- SSO (SAML 2.0 / OAuth 2.0)
- Potential white-label

---

## 5. Cost Trajectory

The "scale infra alongside users" phased model in earlier drafts is replaced by a binary trajectory: homelab summer → launch arch September. Once the 1-yr RI is committed in mid-August, fixed cost is locked at €480/mo regardless of user count up to the capacity ceiling of g5.xlarge (well above 200 active users).

| period | infra | $/mo | notes |
|---|---|---|---|
| May–early Aug 2026 | homelab | ~€0.50 | dev + closed beta |
| mid–late Aug 2026 | AWS provisioning, on-demand smoke-test | ~$50 (partial mo) | overlap with homelab during cutover |
| ~Sept 2026 onward | AWS launch arch §1.5, 1-yr RI committed | ~€480 | RI commit ~25 Aug = $5,784 once |

**For the product/feature phase plan** (controlled beta → soft launch → paid cohort growth), see `ROADMAP.md`. This doc focuses on cost; the roadmap focuses on what we ship in each phase.

---

## 6. Key Risks Before Public Launch

| Risk                       | Severity   | Mitigation                                                                                                                             |
| -------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **AWS credit expiry**      | Resolved   | Credits expired April 5 2026. Real spend now ~€39/mo, with planned migration to homelab dropping it to ~€0.50/mo.                       |
| **Cold-start UX**          | Resolved   | Launch arch §1.5 is always-warm. Cold start no longer applies post-cutover.                                                            |
| **GDPR**                   | High       | Irish jurisdiction, all EU users in scope. Need privacy policy, DPA, data residency docs. AWS eu-west-1 (Ireland) satisfies residency. |
| **Cost spike**             | Medium     | One viral post → many imports → GPU saturation rather than cost spike (RI is fixed). Per-user caps + billing alarms in place.                  |
| **Canvas ToS**             | Medium     | Using OAuth with user credentials is legitimate. Watch for institution-level API restrictions.                                         |
| **Cohere rerank at scale** | Medium     | 500 daily active users each doing 20 searches = $600/month in rerank alone. Cache results where possible. Per-tier caps prevent runaway. |
| **Single-instance blast radius** | Medium | Launch arch §1.5 is one EC2 box — postgres + app + worker + GPU all on one host. Hardware blip = total outage. Daily EBS snapshot + nightly `pg_dump` to S3. Move postgres to RDS multi-AZ post-launch when revenue justifies. |

---

## 7. Current AWS Infrastructure State (April 2026 — being decommissioned)

This shape is the legacy distributed setup, scheduled for teardown ahead of the launch arch in §1.5.

| Resource        | Name / ID                  | Region    | Status                      | Fate                          |
| --------------- | -------------------------- | --------- | --------------------------- | ----------------------------- |
| Amplify app     | `<amplify-app-id>`           | eu-west-1 | Active                      | delete in homelab teardown    |
| ECS cluster     | `oghmanotes`               | eu-west-1 | Active                      | delete in homelab teardown    |
| ECS service     | `canvas-import-worker`     | eu-west-1 | Scaled per demand           | delete (worker moves on-box)  |
| Marker ASG      | `<marker-asg>`    | eu-west-1 | desired=0, spot enabled     | delete (Marker moves on-box)  |
| Marker ALB      | `marker-alb-oghmanotes`    | eu-west-1 | Active (costs ~$18/mo idle) | delete (caddy on-box replaces)|
| Launch template | `<launch-template>` v22 | eu-west-1 | Spot, g5.xlarge             | delete                        |
| RDS             | db.t3.micro (PostgreSQL)   | eu-west-1 | Active                      | delete (postgres in compose)  |
| Redis           | cache.t3.micro             | eu-west-1 | Active                      | delete (valkey in compose)    |
| Route53 zone    | `oghmanotes.ie`            | global    | Active                      | **keep** — points to launch IP |
| SES             | sending identity           | eu-west-1 | Active                      | **keep** — least-priv IAM user|

### Scheduled Scaling Actions (<marker-asg>)

None. Pure scale-to-zero. GPU spins up on demand (~4-7 min cold start), scales back to 0 when idle.

To add a warm window later (when you have paying Pro users who need it):

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
