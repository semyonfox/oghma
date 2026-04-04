# OghmaNote — Initial Launch Checklist

> Track progress toward the first real users.
> Sections are ordered: blockers first, nice-to-haves after.

---

## 1. Broken Things (Fix Before Anyone Touches It)

- [ ] **Change password** — endpoint exists but UI is not wired up (`settings` page)
- [ ] **Delete account** — endpoint is a `console.log` stub, no actual deletion
- [ ] **Canvas import end-to-end** — verify a real PDF goes all the way from Canvas → extract → embed → searchable. Never been confirmed in prod.
- [ ] **SES out of sandbox** — password reset emails only work for verified addresses until you request production access from AWS. Go to SES → Account dashboard → Request production access.
- [ ] **Stray `1` file in project root** — delete it

---

## 2. Security

- [ ] All secrets rotated from dev values (JWT_SECRET, NEXTAUTH_SECRET, AUTH_SECRET, SERVER_ENCRYPTION_SECRET)
- [ ] `ENABLE_CREDENTIALS_AUTH=true` is intentional — confirm OAuth providers (Google/GitHub) are either wired up or removed from the UI
- [ ] S3 bucket is private (no public ACL), presigned URLs only
- [ ] RDS is not publicly accessible (VPC only, security group locked)
- [ ] Redis has TLS enabled in production (`REDIS_TLS=true`)
- [ ] WAF rules reviewed — currently active and billing (~$19/month)
- [ ] Rate limiting confirmed working for login (`/api/auth/login`)
- [ ] Set up AWS billing alerts: $50 / $100 / $200 thresholds
  ```bash
  # quick check if any alarms exist
  aws cloudwatch describe-alarms --region eu-north-1 --query 'MetricAlarms[*].AlarmName'
  ```

---

## 3. Legal / Compliance (GDPR — you're in Ireland, this is not optional)

- [ ] **Privacy policy** published at `/privacy` — must cover: what data is collected, stored, how long, user rights (access, deletion, portability)
- [ ] **Terms of service** published at `/terms`
- [ ] **Cookie notice** — do you use any tracking cookies? If yes, consent banner required. If no analytics/tracking, a simple "we use only essential cookies" banner is fine.
- [ ] **Contact email** listed for data requests (GDPR Article 12) — a real inbox, not a form
- [ ] **Account deletion actually works** (see section 1) — legally required under GDPR Article 17
- [ ] Data residency: AWS eu-west-1 (Ireland) for Marker, eu-north-1 (Stockholm) for everything else — both are EU, both are fine

---

## 4. Infrastructure Sanity Check

- [ ] Amplify env vars are all set in console (not just `.env.local`) — cross-check against `.env.example`
- [ ] `DATABASE_URL` points to production RDS (not local Docker)
- [ ] `pgvector` extension enabled on production RDS:
  ```sql
  SELECT * FROM pg_extension WHERE extname = 'vector';
  ```
- [ ] All DB migrations applied in order (`database/` folder)
- [ ] S3 bucket exists in `eu-north-1`, CORS configured for `oghmanotes.ie`
- [ ] SQS queue exists and worker has IAM permissions to consume it
- [ ] ECS `canvas-import-worker` service healthy (or scaled to 0 intentionally)
- [ ] Marker ASG at desired=0 (scale-to-zero confirmed) — **GPU should not be running idle**
  ```bash
  aws autoscaling describe-auto-scaling-groups \
    --auto-scaling-group-name <marker-asg> \
    --region eu-west-1 \
    --query 'AutoScalingGroups[0].DesiredCapacity'
  ```
- [ ] Redis reachable from production app (not just localhost)
- [ ] Domain `oghmanotes.ie` resolving to Amplify — check with `dig oghmanotes.ie`
- [ ] SSL cert valid and auto-renewing (Amplify handles this, just verify HTTPS works)

---

## 5. Core User Flows — Manual QA Pass

Do these yourself end-to-end in production before inviting anyone:

- [ ] Register a new account with a real email
- [ ] Verify password reset email arrives (confirms SES is working)
- [ ] Create a note, type content, reload — content persists
- [ ] Upload a PDF — appears in file tree, opens in viewer
- [ ] Connect Canvas (if you have a test Canvas account)
- [ ] Run a Canvas import — at least one file reaches `indexed` status
- [ ] Ask a question in AI chat — get a relevant answer
- [ ] Log out, log back in — session works
- [ ] Try a wrong password 5 times — account lockout triggers
- [ ] Mobile: open on a phone, check layout doesn't break completely

---

## 6. Monitoring & Observability

- [ ] CloudWatch log groups exist for ECS worker (`/aws/ecs/oghmanotes/canvas-import-worker`)
- [ ] Set a CloudWatch alarm on ECS task failures
- [ ] Set a CloudWatch alarm if RDS CPU > 80% for 5 min
- [ ] Consider adding [Sentry](https://sentry.io) for frontend error tracking (free tier covers early usage)
  - Add `SENTRY_DSN` to env, wrap `_app.tsx` with Sentry provider
- [ ] Uptime monitoring — [UptimeRobot](https://uptimerobot.com) free tier pings `oghmanotes.ie` every 5 min and emails you if it goes down

---

## 7. Product Polish (Before Inviting People)

- [ ] Landing page accurately reflects what the product does today (no "coming soon" features listed as ready)
- [ ] Onboarding — new user lands on an empty workspace with no clue what to do. Add at minimum a welcome note or tooltip pointing at Canvas import
- [ ] Error states are user-friendly (not raw JSON or blank screens)
- [ ] Cold-start UX for OCR — when a user triggers a Canvas import and the GPU is cold, show a message like "Processing your files, this may take a few minutes" rather than a spinner with no explanation
- [ ] "Coming soon" buttons (note export, import, AI panel actions) — either remove them or disable with a tooltip. Don't show broken buttons to real users.

---

## 8. Payments (When Ready to Charge)

- [ ] [Stripe](https://stripe.com/ie) account created (Irish entity — use Stripe Ireland)
- [ ] Products created: Student (€4.99/mo, €39/yr), Pro (€9.99/mo, €79/yr)
- [ ] Webhook endpoint `/api/stripe/webhook` implemented to handle `checkout.session.completed`, `customer.subscription.deleted`
- [ ] User table has `plan` column (`free` | `student` | `pro`) — gate Canvas import and AI search behind it
- [ ] Pricing page at `/pricing` live
- [ ] Test mode payments work end-to-end before going live
- [ ] VAT — Irish digital services to EU consumers require VAT. Look into Stripe Tax (handles this automatically)

---

## 9. First Users — Rollout

- [ ] Decide: open registration or invite-only?
  - Invite-only recommended first — keeps load predictable, easier to support personally
- [ ] Set up a waitlist (even just a Google Form) if going invite-only
- [ ] Identify first 5-10 beta users (NUIG students who will give real feedback)
- [ ] Have a feedback channel ready (Discord server, email, or a simple feedback form in the app)
- [ ] Know how to check who has registered:
  ```sql
  SELECT email, created_at FROM app.users ORDER BY created_at DESC LIMIT 20;
  ```
- [ ] Know how to check if Canvas imports are working:
  ```sql
  SELECT status, COUNT(*) FROM app.canvas_import_jobs GROUP BY status;
  ```

---

## Summary

| Section        | Blockers | Status                       |
| -------------- | -------- | ---------------------------- |
| Broken things  | 5        | Fix before launch            |
| Security       | 8        | Review before launch         |
| GDPR           | 6        | Required by law              |
| Infrastructure | 11       | Verify in prod               |
| Manual QA      | 10       | Do yourself first            |
| Monitoring     | 5        | Set up before inviting users |
| Product polish | 5        | Before inviting users        |
| Payments       | 7        | When ready to charge         |
| Rollout        | 6        | Day of launch                |
