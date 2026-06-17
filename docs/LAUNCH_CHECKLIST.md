# OghmaNotes — Initial Launch Checklist

> Track progress toward the first real users.
> Sections are ordered: blockers first, nice-to-haves after.
> Sister docs: `ROADMAP.md` (timeline + features), `PRICING.md` (pricing + cost model), `../infra/TARGET_HOSTING.md` (launch provider target), `CANVAS_IMPORT_PRICING_REPORT.md` (import economics), `EMAIL_SETUP.md` (email split), and `COMPANY_FORMATION_AND_LAUNCH_ADMIN.md` (company/admin order).
> Timeline anchor: uni starts ~September. Working back: migration off homelab by ~Aug 1, company/payment path ready before paid launch, Stripe live by ~Aug 15 — otherwise everything deferred "for later" stacks into the same final month.

---

## 1. Broken Things (Fix Before Anyone Touches It)

- [x] **Change password** — UI in `password-section.jsx`, API in `/api/auth/change-password/route.js` ✓
- [x] **Delete account** — soft-delete with 30-day grace period in `/api/auth/delete-account/route.ts` ✓
- [ ] **Canvas import end-to-end** — verify a real PDF goes all the way from Canvas → extract → embed → searchable. Never been confirmed in prod.
- [ ] **Cloudflare transactional email configured and tested** — verification, password reset, welcome, and import-complete emails must send from the company domain before inviting users.
- [x] **Stray `1` file in project root** — delete it (no longer exists)

---

## 2. Security

- [ ] All secrets rotated from dev values (JWT_SECRET, NEXTAUTH_SECRET, AUTH_SECRET, SERVER_ENCRYPTION_SECRET)
- [ ] `ENABLE_CREDENTIALS_AUTH=true` is intentional — confirm OAuth providers (Google/GitHub) are either wired up or removed from the UI

Current homelab beta checks:

- [ ] RustFS bucket is private; browser access is via presigned URLs only
- [ ] PostgreSQL is internal to the homelab Docker network and not publicly exposed
- [ ] Redis is internal to the homelab Docker network and not publicly exposed
- [ ] Cloudflare tunnel/nginx routing reviewed; no direct public app/database/storage ports

Launch-provider checks:

- [ ] Neon database access locked down to the selected runtime paths; pooled and migration connections separated.
- [ ] Cloudflare R2 bucket is private; browser access is via presigned/proxied URLs only.
- [ ] Redis/BullMQ provider is private or IP/credential restricted; no unauthenticated public Redis.
- [ ] Cloudflare WAF/rate-limit rules reviewed for login, auth callbacks, upload, Canvas import, and chat routes.
- [ ] Runtime host secrets are stored in the provider secret store, not committed env files.

- [ ] Rate limiting confirmed working for login (`/api/auth/login`)
- [ ] Set up provider billing/usage alerts for Cloudflare, Neon, app/runtime host, GPU rental, AI providers, Stripe, and any AWS service still retained.

---

## 3. Legal / Compliance (GDPR — you're in Ireland, this is not optional)

- [x] **Privacy policy** published at `/privacy` — review wording before public launch
- [x] **Terms of service** published at `/terms` — includes early-service notice; review wording before public launch
- [ ] **Cookie notice** — `/cookies` exists; confirm whether the app uses tracking cookies and whether a banner is needed
- [x] **Contact email** listed for data requests (GDPR Article 12) — privacy/terms pages use `contact@oghmanotes.ie`
- [x] **Account deletion actually works** (see section 1) — legally required under GDPR Article 17
- [x] Data residency documented for the current stack: app data on Irish homelab; AWS eu-west-1 only where still retained
- [ ] Data residency/provider list updated again before paid launch to match the final Cloudflare/Neon/R2/runtime split
- [ ] **Founder agreement** — ownership, IP assignment, exit terms. Code, domain, and infra are currently one founder's personal property while two founders and a contributor (Sam) have work in the repo. Do this before the work split ramps up, not before launch
- [ ] **Privacy policy covers chat storage and analysis** — chats are stored and will be analysed to pick the default AI model; the wording (and anonymisation/consent approach) must reflect that, not boilerplate

See [COMPANY_FORMATION_AND_LAUNCH_ADMIN.md](COMPANY_FORMATION_AND_LAUNCH_ADMIN.md) for the LTD, founder, Revenue, RBO, bank, and Stripe order.

---

## 4. Infrastructure Sanity Check

Current homelab checks:

- [ ] Jenkins env vars are set in `/home/semyon/jenkins/env/oghma-prod.env` and `/home/semyon/jenkins/env/oghma-dev.env`
- [ ] `DATABASE_URL` points to `oghma-postgres` and includes `search_path=app,public`
- [ ] `MIGRATION_DATABASE_URL` uses the admin/migrator role and points to `oghma-postgres`
- [ ] `pgvector` extension enabled on production PostgreSQL:
  ```sql
  SELECT * FROM pg_extension WHERE extname = 'vector';
  ```
- [ ] All DB migrations applied in order (`database/` folder)
- [ ] RustFS bucket exists and is reachable from app/worker containers
- [ ] BullMQ worker containers are healthy (`oghma-prod-worker`, `oghma-dev-worker`)
- [ ] Marker/OCR path is intentional: `MARKER_API_URL` set if self-hosted OCR is enabled, otherwise fallback behaviour accepted
- [ ] Redis reachable from production app (not just localhost)
- [ ] Domain `oghmanotes.ie` resolves through Cloudflare tunnel to homelab nginx
- [ ] HTTPS works through Cloudflare
- [ ] **Offsite backup of PostgreSQL + RustFS before inviting test users** — students' only copy of their notes must survive a homelab disk failure; this is a trust-ending event, worse than downtime (~EUR 10/mo)

Launch-target checks:

- [ ] Cloudflare Workers/OpenNext trial completed; either accepted as app host or rejected in favour of a Node container host.
- [ ] Neon Postgres created, `pgvector` enabled, migrations applied, and connection pooling tested.
- [ ] Cloudflare R2 bucket created and tested for uploads, downloads, presigned URLs, metadata, and vault import/export paths.
- [ ] Vault import/export direct S3 clients checked or refactored so they use the same R2-compatible storage settings as the main app.
- [x] Email transport changed from SES-hardcoded SMTP to Cloudflare Email Sending API.
- [ ] Redis/BullMQ runtime selected and tested under import load.
- [ ] Production app/worker runtime selected for current Node worker shape if OpenNext is not enough.
- [ ] Datalab/managed document API is disabled as steady-state processing path; on-demand GPU/batch path is documented.

---

## 5. Core User Flows — Manual QA Pass

Do these yourself end-to-end in production before inviting anyone:

- [ ] Register a new account with a real email
- [ ] Verify password reset email arrives (confirms Cloudflare transactional email is working)
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

- [ ] Current homelab beta logs are accessible (`docker logs oghma-prod`, `docker logs oghma-prod-worker`)
- [ ] Add an alert for app/worker container or runtime restarts and health failures
- [ ] Add an alert for disk usage and PostgreSQL health on the homelab while it remains active
- [ ] Add Neon alerts for connection saturation, storage, compute, failed migrations, and backup/restore status
- [ ] Add R2/storage alerts or dashboard checks for object growth, errors, and unusually high operation volume
- [ ] Add Redis/BullMQ alerts for queue age, failed jobs, stalled jobs, and connection failures
- [ ] Add Cloudflare Email Sending delivery/error monitoring
- [ ] Add GPU rental spend and queue-batch alerts before running paid import cohorts
- [ ] Consider adding [Sentry](https://sentry.io) for frontend error tracking (free tier covers early usage)
  - Add `SENTRY_DSN` to env, wrap `_app.tsx` with Sentry provider
- [ ] Uptime monitoring — [UptimeRobot](https://uptimerobot.com) free tier pings `oghmanotes.ie` every 5 min and emails you if it goes down

---

## 7. Product Polish (Before Inviting People)

- [ ] Landing page accurately reflects what the product does today (no "coming soon" features listed as ready)
- [ ] **Early-access banner** on landing page — "Early access — help us shape the product."
- [ ] **First-run modal** for new accounts — "this is a launch beta. Expect rough edges. Email [founder@oghmanotes.ie] if anything breaks." Direct line to founder is itself a feature BetterCampus / RemNote can't replicate.
- [ ] Onboarding — new user lands on an empty workspace with no clue what to do. Add at minimum a welcome note or tooltip pointing at Canvas import
- [ ] Canvas import estimate UI — show page estimates and warn before large backlog imports.
- [ ] Canvas onboarding allowance UX — explain included onboarding pages and require approval/defer/credits above the threshold.
- [ ] Error states are user-friendly (not raw JSON or blank screens)
- [ ] Cold-start UX for OCR — homelab may use fallback extraction or optional Marker, so keep "Processing your files..." copy honest when OCR/indexing takes time.
- [ ] "Coming soon" buttons and disabled actions — either remove them or disable with a tooltip. Don't show broken buttons to real users.

---

## 8. Payments — Stripe Managed Payments (Merchant of Record)

Using Stripe Managed Payments instead of plain Stripe Checkout. It keeps the payment stack Merchant-of-Record/tax-managed while preserving Stripe's mature checkout, billing portal, webhooks, dashboard, and low payout friction. Decision record: [`docs/PAYMENT_PROCESSOR_DECISION.md`](PAYMENT_PROCESSOR_DECISION.md).

- [ ] Confirm Stripe Managed Payments onboarding requirements — MoR products sometimes require a registered business entity, which would force the Irish LTD before the first paid user
- [ ] Stripe account has Managed Payments enabled and Oghma's digital subscription use case approved
- [ ] Product created: Standard (€10/mo). Keep Premium and annual pricing disabled until usage limits and demand are clearer
- [ ] Usage model drafted: recurring Canvas page allowance, onboarding page allowance, weighted AI model units, and priority queueing rules
- [ ] Checkout session/link created for Standard
- [ ] `app.login` table has billing fields (`billing_provider`, provider customer/subscription IDs, `plan`, `billing_status`, `current_period_end`) — gate Canvas import and AI search from local DB state
- [x] Pricing page at `/pricing` live without paid checkout
- [ ] Checkout buttons wired only after Stripe Managed is approved and tested
- [ ] Stripe webhook endpoint `/api/stripe/webhook` handles checkout, subscription, invoice/payment success, and invoice/payment failure events
- [ ] Stripe customer portal linked from settings for card updates and cancellation
- [ ] Test mode payments work end-to-end before going live

### Manual fallback (if webhook is delayed)

- Stripe dashboard shows all active subscriptions
- Manual fulfilment: check Stripe → set `login.plan`/billing status in DB
- Automate via webhook when volume justifies

---

## 9. First Users — Rollout

- [ ] **Confirm the university's Canvas token policy** (user token generation enabled, TTL, revocation flow) before any marketing spend — universities can disable user tokens or treat third-party token use as a ToS issue, which kills the product at that campus overnight
- [ ] Decide: open registration or invite-only?
  - Invite-only recommended first — keeps load predictable, easier to support personally
- [ ] Set up a waitlist (even just a Google Form) if going invite-only
- [ ] Identify first 5-10 beta users (NUIG students who will give real feedback)
- [ ] Have a feedback channel ready (Discord server, email, or a simple feedback form in the app)
- [ ] Know how to check who has registered:
  ```sql
  SELECT email, created_at FROM app.login ORDER BY created_at DESC LIMIT 20;
  ```
- [ ] Know how to check if Canvas imports are working:
  ```sql
  SELECT status, COUNT(*) FROM app.canvas_import_jobs GROUP BY status;
  ```

---

## Summary

| Area | Launch read |
|---|---|
| Broken things | Canvas E2E and Cloudflare transactional email remain the hard product blockers |
| Security | Rotate secrets, confirm OAuth/credentials posture, and add provider-wide billing/usage alerts |
| GDPR + legal | Policies exist, but provider list, cookie decision, founder agreement, and chat-analysis wording still need review |
| Infrastructure | Homelab is the interim stack; launch target needs OpenNext/runtime, Neon, R2, Redis/BullMQ, and GPU-batch validation |
| Manual QA | Run the full account/upload/Canvas/chat/mobile pass yourself in production |
| Monitoring | Add app/worker/container/runtime, DB, queue, storage, uptime, and billing alerts before inviting users |
| Product polish | Import estimates, onboarding allowance UX, and honest processing-state copy are required for large Canvas imports |
| Payments | Stripe Managed setup waits on company/payment readiness; launch Standard only |
| Rollout | Confirm Canvas token policy and start invite-only before broad marketing |

> Last verified: 2026-06-15 · Updated for Cloudflare/Neon/R2 launch target and Canvas import pricing report.
