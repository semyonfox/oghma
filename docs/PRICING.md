# OghmaNote — Pricing & Commercial Planning

> Last updated: April 2026
> Based on real AWS billing data (Cost Explorer) and Cohere API pricing.

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

### 1.2 Marker GPU (g5.xlarge, eu-west-1)

The GPU is the biggest variable cost. Options ranked cheapest to most expensive:

| Mode                                  | $/month     | Notes                                |
| ------------------------------------- | ----------- | ------------------------------------ |
| Scale-to-zero (off-peak only)         | ~$0 + usage | Cold start 4-7 min when idle         |
| **Spot, warm window 08:00-23:00 IST** | **~$105**   | **Current config — recommended**     |
| Spot, always-on (24/7)                | ~$252       | No cold start, overkill for now      |
| On-demand, warm window                | ~$290       | Never use this                       |
| On-demand, always-on (24/7)           | **~$725**   | What was running Apr 1-2 — stop this |

**Current setup (as of April 2026):**

- ASG: `marker-asg-oghmanotes` in eu-west-1
- Instance: g5.xlarge spot (`lt-022bacbafcb5a98a8`, version 22)
- No scheduled actions — pure scale-to-zero
- GPU only runs when an import is triggered, cold start every time (~4-7 min)

**GPU specs:** NVIDIA A10G, 24GB VRAM, 31.2 TFLOPS FP16 — processes ~1-3 pages/second for Marker.

### 1.3 Why Not a Bigger GPU?

All g5 variants (xlarge through 4xlarge) use **the same single A10G GPU**. Larger variants add CPU/RAM only. The g5.xlarge is the correct choice — going bigger costs 2-4x more for zero OCR throughput gain.

The only bigger GPU option is g5.12xlarge (4x A10G) at ~$16/hr = $11,500/month. Never.

### 1.4 Total Monthly Cost Scenarios

| GPU mode                         | Fixed    | GPU       | **Total**           |
| -------------------------------- | -------- | --------- | ------------------- |
| Scale-to-zero                    | $149     | ~$5-20    | **~$154-169/month** |
| **Warm window (spot) — current** | **$149** | **~$105** | **~$254/month**     |
| Always-on (spot)                 | $149     | ~$252     | ~$401/month         |
| Always-on (on-demand)            | $149     | ~$725     | ~$874/month         |

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

| Approach                  | Cost per page | Cost at 1K pages/month |
| ------------------------- | ------------- | ---------------------- |
| Self-hosted GPU (current) | ~$0.0006      | ~$0.60                 |
| Marker API (datalab.to)   | ~$0.04-0.10   | ~$40-100               |

Self-hosted wins at any meaningful scale. Breakeven is ~30-40 pages/month total across all users. Above that, self-hosted is 70-175x cheaper per page.

---

## 3. Break-Even Analysis

### Per-User Variable Cost

| Component                        | Cost/active user/month |
| -------------------------------- | ---------------------- |
| Cohere rerank (avg 200 searches) | ~$0.40                 |
| Cohere embed (new content)       | ~$0.02                 |
| Marker GPU time (new PDFs)       | ~$0.10-0.50            |
| S3 + bandwidth                   | ~$0.05                 |
| ECS (import worker)              | ~$0.02                 |
| **Total variable**               | **~$0.60-$1.00**       |

### Break-Even at €4.99/month (Student tier)

- Contribution margin: €4.99 - €1.00 ≈ **€3.99/user**
- Floor cost (warm window config): **~€254/month**
- Break-even: **~64 paid users**

### Break-Even at €9.99/month (Pro tier)

- Contribution margin: €9.99 - €1.00 ≈ **€8.99/user**
- Break-even: **~28 paid users**

### Scale-to-Zero Configuration (no warm window)

- Floor: ~€155/month
- Break-even at €4.99: **~39 paid users**
- Break-even at €9.99: **~18 paid users**

> Recommendation: use scale-to-zero during the beta phase (0 paid users). Switch to warm window when first paying cohort reaches ~20 users.

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
- Standard OCR queue (accepts cold start)

### Pro — €9.99/month or €79/year

- Unlimited Canvas import
- Unlimited AI searches
- Priority OCR (warm GPU — no cold start, 08:00–23:00 IST)
- 15GB storage
- Vault export (Obsidian/Markdown zip)

### University Licence — contact for pricing

- Per-institution site licence
- Canvas OAuth integration at institutional level
- Data residency documentation (GDPR)
- SSO (SAML 2.0 / OAuth 2.0)
- Potential white-label

---

## 5. Public Release Strategy

### Phase 1 — Controlled Beta (now → ~20 users)

- Invite-only, no charge
- University of Galway first (direct access via CompSoc)
- Infrastructure: scale-to-zero GPU, no warm window
- Goal: product feedback, fix cold-start UX, validate Canvas import reliability
- Cost: ~€155/month (floor only)

### Phase 2 — Soft Launch (20-100 users)

- Stripe + subscription management
- Enable Free tier publicly
- Student tier at €4.99/month
- Keep scale-to-zero GPU (cold start acceptable for free tier)
- Channels: r/college, r/NUIG, r/ObsidianMD, r/productivity, NUIG CompSoc Discord
- Product Hunt launch (needs demo video + landing page polish)

### Phase 3 — Paid Cohort Growth (100+ users)

- Enable warm window GPU (08:00-23:00 IST) when ~20 paid users
- Pro tier at €9.99/month with warm GPU
- University partnerships (pitch student unions / IT depts)
- Cost: ~€254/month, self-funding at ~64 Student or ~28 Pro paid users

---

## 6. Key Risks Before Public Launch

| Risk                       | Severity   | Mitigation                                                                                                                             |
| -------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **AWS credit expiry**      | High       | Credits cover ~$875/month right now. Know your credit balance and expiry date.                                                         |
| **Cold-start UX**          | High       | 4-7 min warm-up for OCR kills first impressions. Implement pre-warm on login for paid tier.                                            |
| **GDPR**                   | High       | Irish jurisdiction, all EU users in scope. Need privacy policy, DPA, data residency docs. AWS eu-west-1 (Ireland) satisfies residency. |
| **Cost spike**             | Medium     | One viral post → many imports → GPU costs spike. Set AWS billing alerts at $50/$100/$200. Add per-user upload quotas from day one.     |
| **Canvas ToS**             | Medium     | Using OAuth with user credentials is legitimate. Watch for institution-level API restrictions.                                         |
| **Cohere rerank at scale** | Low-Medium | 500 daily active users each doing 20 searches = $600/month in rerank alone. Cache results where possible.                              |

---

## 7. Current AWS Infrastructure State (April 2026)

| Resource        | Name / ID                  | Region    | Status                      |
| --------------- | -------------------------- | --------- | --------------------------- |
| Amplify app     | `d3nmhn9o8j3uf3`           | eu-west-1 | Active                      |
| ECS cluster     | `oghmanotes`               | eu-west-1 | Active                      |
| ECS service     | `canvas-import-worker`     | eu-west-1 | Scaled per demand           |
| Marker ASG      | `marker-asg-oghmanotes`    | eu-west-1 | desired=0, spot enabled     |
| Marker ALB      | `marker-alb-oghmanotes`    | eu-west-1 | Active (costs ~$18/mo idle) |
| Launch template | `lt-022bacbafcb5a98a8` v22 | eu-west-1 | Spot, g5.xlarge             |
| RDS             | db.t3.micro (PostgreSQL)   | eu-west-1 | Active                      |
| Redis           | cache.t3.micro             | eu-west-1 | Active                      |

### Scheduled Scaling Actions (marker-asg-oghmanotes)

None. Pure scale-to-zero. GPU spins up on demand (~4-7 min cold start), scales back to 0 when idle.

To add a warm window later (when you have paying Pro users who need it):

```bash
# scale up 08:00 IST (07:00 UTC)
aws autoscaling put-scheduled-update-group-action \
  --auto-scaling-group-name marker-asg-oghmanotes \
  --scheduled-action-name marker-scale-up-morning \
  --recurrence "0 7 * * *" \
  --min-size 1 --max-size 2 --desired-capacity 1 \
  --region eu-west-1

# scale down 23:00 IST (22:00 UTC)
aws autoscaling put-scheduled-update-group-action \
  --auto-scaling-group-name marker-asg-oghmanotes \
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
  --auto-scaling-group-name marker-asg-oghmanotes \
  --region eu-west-1 \
  --query 'AutoScalingGroups[0].{Desired:DesiredCapacity,Min:MinSize,Instances:Instances[*].LifecycleState}'

# manually scale GPU up (e.g. for testing)
aws autoscaling set-desired-capacity \
  --auto-scaling-group-name marker-asg-oghmanotes \
  --desired-capacity 1 \
  --region eu-west-1

# manually scale GPU down (stop the bill)
aws autoscaling set-desired-capacity \
  --auto-scaling-group-name marker-asg-oghmanotes \
  --desired-capacity 0 \
  --region eu-west-1

# disable warm window (keep scale-to-zero only)
aws autoscaling delete-scheduled-action \
  --auto-scaling-group-name marker-asg-oghmanotes \
  --scheduled-action-name marker-scale-up-morning \
  --region eu-west-1

# re-enable warm window
aws autoscaling put-scheduled-update-group-action \
  --auto-scaling-group-name marker-asg-oghmanotes \
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
