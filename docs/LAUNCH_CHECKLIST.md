# OghmaNote — Initial Launch Checklist

> Track progress toward the first real users.
> Sections are ordered: blockers first, nice-to-haves after.
> Sister docs: `ROADMAP.md` (timeline + features) · `PRICING.md` (cost model + live homelab arch). Operational + governance docs are private.

---

## 1. Broken Things (Fix Before Anyone Touches It)

- [x] **Change password** — UI in `password-section.jsx`, API in `/api/auth/change-password/route.js` ✓
- [x] **Delete account** — soft-delete with 30-day grace period in `/api/auth/delete-account/route.ts` ✓
- [ ] **Canvas import end-to-end** — verify a real PDF goes all the way from Canvas → extract → embed → searchable. Never been confirmed in prod.
- [ ] **SES out of sandbox** — password reset emails only work for verified addresses until you request production access from AWS. Go to SES → Account dashboard → Request production access.
- [x] **Stray `1` file in project root** — delete it (no longer exists)

---

## 2. Security

- [ ] All secrets rotated from dev values (JWT_SECRET, NEXTAUTH_SECRET, AUTH_SECRET, SERVER_ENCRYPTION_SECRET)
- [ ] `ENABLE_CREDENTIALS_AUTH=true` is intentional — confirm OAuth providers (Google/GitHub) are either wired up or removed from the UI
- [ ] RustFS bucket is private; browser access is via presigned URLs only
- [ ] PostgreSQL is internal to the homelab Docker network and not publicly exposed
- [ ] Redis is internal to the homelab Docker network and not publicly exposed
- [ ] Cloudflare tunnel/nginx routing reviewed; no direct public app/database/storage ports
- [ ] Rate limiting confirmed working for login (`/api/auth/login`)
- [ ] Set up AWS billing alerts at **$50 / $200 / $500 / $1000** (supersedes earlier $50/$100/$200 plan)
  ```bash
  # quick check if any alarms exist
  aws cloudwatch describe-alarms --region eu-west-1 --query 'MetricAlarms[*].AlarmName'
  ```

---

## 3. Legal / Compliance (GDPR — you're in Ireland, this is not optional)

- [ ] **Privacy policy** published at `/privacy` — must cover: what data is collected, stored, how long, user rights (access, deletion, portability)
- [ ] **Terms of service** published at `/terms` — include the "early experimental" clause: service may have downtime, data loss possible (backups maintained but not guaranteed), features may change without notice — exchange for discounted launch pricing
- [ ] **Cookie notice** — do you use any tracking cookies? If yes, consent banner required. If no analytics/tracking, a simple "we use only essential cookies" banner is fine.
- [ ] **Contact email** listed for data requests (GDPR Article 12) — a real inbox, not a form
- [ ] **Account deletion actually works** (see section 1) — legally required under GDPR Article 17
- [ ] Data residency: app data on Irish homelab; AWS eu-west-1 for SES/Route 53 where used

---

## 4. Infrastructure Sanity Check

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

- [ ] Container logs are accessible on the homelab (`docker logs oghma-prod`, `docker logs oghma-prod-worker`)
- [ ] Add an alert for app/worker container restarts or health failures
- [ ] Add an alert for disk usage and PostgreSQL health on the homelab
- [ ] Consider adding [Sentry](https://sentry.io) for frontend error tracking (free tier covers early usage)
  - Add `SENTRY_DSN` to env, wrap `_app.tsx` with Sentry provider
- [ ] Uptime monitoring — [UptimeRobot](https://uptimerobot.com) free tier pings `oghmanotes.ie` every 5 min and emails you if it goes down

---

## 7. Product Polish (Before Inviting People)

- [ ] Landing page accurately reflects what the product does today (no "coming soon" features listed as ready)
- [ ] **Early-access banner** on landing page — "Early access — help us shape the product."
- [ ] **First-run modal** for new accounts — "this is a launch beta. Expect rough edges. Email [founder@oghmanotes.ie] if anything breaks." Direct line to founder is itself a feature BetterCampus / RemNote can't replicate.
- [ ] Onboarding — new user lands on an empty workspace with no clue what to do. Add at minimum a welcome note or tooltip pointing at Canvas import
- [ ] Error states are user-friendly (not raw JSON or blank screens)
- [ ] Cold-start UX for OCR — homelab may use fallback extraction or optional Marker, so keep "Processing your files..." copy honest when OCR/indexing takes time.
- [ ] "Coming soon" buttons (note export, import, AI panel actions) — either remove them or disable with a tooltip. Don't show broken buttons to real users.

---

## 8. Payments — Polar (Merchant of Record)

Using [Polar](https://polar.sh) instead of Stripe — they handle EU VAT as Merchant of Record, so we don't need to register for Irish VAT or file returns. 5% fee (vs Stripe ~3% + you handle tax).

- [ ] Polar account created, organisation set up
- [ ] Products created: Standard (€10/mo, €79/yr), Premium (€20/mo, €159/yr)
- [ ] Generate checkout links for each tier
- [ ] `app.login` table has `plan` column (`free` | `standard` | `premium`) — gate Canvas import and AI search behind it
- [ ] Pricing page at `/pricing` live, with checkout buttons
- [ ] Polar webhook endpoint `/api/polar/webhook` to handle subscription events
- [ ] Test mode payments work end-to-end before going live

### Manual fallback (if webhook is delayed)

- Polar dashboard shows all active subscriptions
- Manual fulfilment: check Polar → set `login.plan` in DB
- Automate via webhook when volume justifies

---

## 9. First Users — Rollout

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

| Section        | Items | Done | Status                       |
| -------------- | ----- | ---- | ---------------------------- |
| Broken things  | 5     | 3    | 2 remaining (SES, Canvas E2E) |
| Security       | 8     | ?    | Review before launch         |
| GDPR           | 6     | 1    | Required by law (delete account ✓) |
| Infrastructure | 11    | ?    | Verify in prod               |
| Manual QA      | 10    | 0    | Do yourself first            |
| Monitoring     | 5     | 0    | Set up before inviting users |
| Product polish | 5     | ?    | Before inviting users        |
| Payments       | 7     | 0    | Polar setup when ready to charge |
| Rollout        | 6     | 0    | Day of launch                |

> Last verified: 2026-05-25
