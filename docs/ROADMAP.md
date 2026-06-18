# OghmaNotes — Product Roadmap

> Last updated: 2026-06-15
> Shaped by: competitive analysis vs BetterCampus + RemNote, real Canvas import audit data, live homelab experience, provider-pricing checks, user feedback signals
> See also: `PRICING.md` (pricing + cost model), `CANVAS_IMPORT_PRICING_REPORT.md` (import economics source of truth), `../infra/TARGET_HOSTING.md` (launch hosting target), `LAUNCH_CHECKLIST.md` (pre-launch blockers), and `COMPANY_FORMATION_AND_LAUNCH_ADMIN.md` (company/payment order). Operational/governance + competitive research kept private.

---

## where we are

**team:** three founders running this as a side project, not VC-track.

**product state:** functional, not yet launched. Canvas import, RAG chat, FSRS flashcards, quiz gen, PDF viewer, time blocks, iCal subscription, vault import/export — all shipped. Not yet in the hands of real users.

**infrastructure state:** homelab is live now for both prod and dev, but it is an interim stack because ISP upload/reliability is a launch constraint. The launch target is Cloudflare for DNS/edge/email/R2, Neon Postgres + pgvector, and either Cloudflare Workers/OpenNext if the trial is clean or a small Node/Docker host if it is not. AWS is archive/fallback only unless explicitly retained. GPU work should be on-demand and batched until revenue and queue volume justify longer worker windows.

**the market moment:** BetterCampus (1.5M installs) is mid-pivot to freemium and users are revolting — April 2026 feedback board is full of "uninstalled", "corporate cash grab", "bring back old free features". RemNote (1M users) charges €18/month for AI and has zero Canvas awareness. Neither competitor can replicate what OghmaNotes has structurally.

---

## phase 0 — fix before anyone touches it

> canonical checklist: `LAUNCH_CHECKLIST.md`.

Resolved: change password, 30-day account deletion grace period, privacy page, terms page, and public pricing page routes exist.

Still blocking launch:

- [ ] Canvas import end-to-end verified in prod (PDF → extract → embed → searchable)
- [ ] Cloudflare transactional email configured and tested
- [ ] secrets rotated from dev/default values
- [ ] billing/infra alerts configured
- [ ] legal pages reviewed for launch accuracy
- [ ] cold-start UX shows clear "processing may take a few minutes" copy

---

## phase 1 — controlled beta (0 → ~20 users)

**goal:** real feedback from UoG students (closed cohort over summer), fix what breaks, validate Canvas import reliability
**when:** May–Aug 2026
**infrastructure:** current homelab Docker stack for controlled beta only. Use the same app/worker/Postgres/Redis/S3-compatible shape while validating Canvas import, but do not treat home upload bandwidth as the paid-launch path.
**cost:** low fixed base while on existing hardware, plus Google Workspace/Cloudflare/provider usage where enabled. This is operationally cheap, not launch-grade hosting.
**channel:** UoG CompSoc Discord, direct invites

### quick wins to ship before inviting anyone (1–2 days each)

these are all data already in the DB — no new syncing required:

1. [ ] **assignment type icons** — `plannable_type` on every assignment. add distinct icons for quiz / discussion / announcement / assignment. BetterCampus has this, makes the task list scannable.

2. [x] **points visible on assignment cards** — `points_possible` shown in assignment-tracker.tsx next to due date.

3. [x] **relative due date urgency colour** — implemented in `urgencyLabel()`: overdue/today → red, tomorrow/<3d → amber. applied in assignment tracker.

4. [x] **"cross-off" toggle** — `status` column with toggle between "done"/"upcoming". one-click via `handleToggleDone()`. confetti on completion.

5. [ ] **recent feedback surface** — show last 3–4 graded assignments with score + rubric comments on the home/dashboard. canvas API: `GET /api/v1/courses/:id/assignments?include[]=submission&include[]=rubric_assessment`. BetterCampus has this on their sidebar. high-value, one API call.

### beta feedback targets
- does Canvas import actually work across different UoG courses?
- what's the cold-start experience like? is 4–7 min acceptable?
- which features do students use first / ignore?
- what's missing that they expected?

---

## phase 2 — soft launch (20 → 100 users)

**goal:** first paying users, validate €10 Standard tier
**when:** Sept 2026 onward (back-to-school)
**infrastructure:** move the public launch path off the home ISP if provider tests pass: Cloudflare DNS/edge/email/R2, Neon Postgres + pgvector, Redis/BullMQ where the worker runs, and Cloudflare Workers/OpenNext or a small Node/Docker app host. Keep homelab as fallback/admin reference, not the main paid-user dependency.
**cost:** provider-trial dependent base plus AI usage and on-demand GPU batches. Upgrade only when the previous month can pay for it.
**channels:** r/college, r/NUIG, r/ObsidianMD, CompSoc, Product Hunt (needs demo video)

### ship in this phase

**competitive gap closers vs BetterCampus:**

6. [ ] **drag-to-plan UX** — replace form-based time block creation with drag onto calendar. BetterCampus paywall equivalent (they charge for time-level scheduling). OghmaNotes time blocks are already free — just needs the UX.

7. [ ] **in-quiz socratic hint** — "Hint" button on quiz session. sends question + options to LLM with system prompt: nudge reasoning, don't reveal answer. single API call per hint. BetterCampus has this, it's one of their standout features.

8. [ ] **"explain simply" on flashcard back** — after flip, show AI quick-actions: "explain simply", "give an example". one-tap → streams into panel below card. BetterCampus has this.

9. [ ] **per-task custom label/tag** — `label` column on assignments. inline text input. "pair work", "worth 30%", "group project". BetterCampus has this.

**competitive gap closers vs RemNote:**

10. [ ] **inline flashcard creation from notes** — RemNote's killer UX. `::` shortcut in Lexical block creates a flashcard from that block. zero context switch between note-taking and card creation. closes the biggest UX gap vs RemNote.

11. [ ] **exam scheduler** — set exam date → auto-build daily FSRS review schedule working backwards. simple form: exam name, date, course. RemNote has this and it's a high-perceived-value feature at semester end.

**trust / no-lock-in:**

12. [x] **vault export** — all notes + files as `.zip`. implemented in data-export-section.jsx with async job polling. ✓

13. [ ] **BYOK (OpenRouter)** — store user's OpenRouter key (AES-GCM, same pattern as Canvas token). route AI calls through their key if set. free tier becomes effectively unlimited for technical users. zero model cost to OghmaNotes.

---

## phase 3 — paid cohort growth (100+ users)

**goal:** sustainable, self-funding. word of mouth beyond UoG.
**when:** Oct 2026 onward, contingent on phase 2 conversion
**infrastructure:** scale the launch target before adding exotic infrastructure: tune Neon, Redis/BullMQ, R2, app/worker hosts, queue concurrency, and batch windows. Add longer 4080/4090-style GPU windows only when imports keep the worker busy; use H100 bursts for onboarding cohorts.
**cost:** scales with queue volume and selected runtime. Avoid fixed GPU commitments until imports/search usage proves demand.
**channels:** broader Canvas community, university IT partnerships

### ship in this phase

14. [ ] **Anki `.apkg` export** — export flashcard decks to Anki format. critical for medicine / nursing / pharmacy students who are Anki-native. also an import path: "bring your Anki decks into OghmaNotes".

15. [x] **vault import (Obsidian/markdown)** — `.zip` files with `.md`, PDF, DOCX → notes vault. implemented in data-export-section.jsx. ✓

16. [ ] **Google Calendar push sync** — BetterCampus has this free. OghmaNotes has iCal (pull) but not push. OAuth → write canvas deadlines to student's Google Calendar directly.

17. [ ] **PDF section-by-section AI** — instead of whole-document RAG, generate flashcards per PDF section. RemNote's approach. more actionable, less overwhelming for large lecture slide decks.

18. [ ] **advanced FSRS analytics** — weak card heatmap, streak history, estimated time-to-mastery per deck. Premium tier differentiator.

19. [ ] **shared study sets** — collaborate on flashcard decks with course-mates. group notes. Pro/Max tier.

---

## phase 4 — longer-term / expensive

these are validated directions, not yet prioritised for specific sprints:

- **lecture transcription** — audio → Whisper → note. BetterCampus caps at 150 min/month free. OghmaNotes could offer more generously, or run transcription during rented GPU batch windows once demand is proven.
- **image occlusion** — select region of image → cloze flashcard. critical for medicine, anatomy, biology, geography. RemNote has this.
- **offline mode** — PWA + service worker + IndexedDB sync. significant engineering. RemNote advantage.
- **auto-summarise imported canvas files** — after Marker OCR, run a summarisation pass and attach as a top-level note. BetterCampus has this as "coming soon" — OghmaNotes could ship first.
- **university / B2B licensing** — one institution deal replaces hundreds of individual conversions. needs GDPR data residency docs, SSO (SAML 2.0), white-label option. worth exploring after 100+ users.

---

## permanent competitive advantages (never need to build — already have)

these are architectural. BetterCampus and RemNote cannot replicate them:

| advantage | vs bettercampus | vs remnote |
|---|---|---|
| persistent AI chat history | BC: "not saved to your account" | RN: credit-gated, session-scoped |
| FSRS spaced repetition | BC: binary session-only | RN: custom SM-2, less accurate |
| canvas tool use in chat | BC: structurally impossible (extension) | RN: zero canvas awareness |
| unlimited storage | BC: 8KB/key chrome hack | RN: 8MB file limit on free |
| any browser / any device | BC: chrome/firefox only | RN: has mobile, but OghmaNotes is web-native |
| Marker OCR quality (STEM PDFs) | BC: no PDF OCR | RN: own model, lower STEM accuracy |
| cheaper AI tier | BC: paywalled | RN: €18/month for full AI |

---

## positioning

**one-liner:** "the Canvas-native study platform that does everything BetterCampus just paywalled and everything RemNote does — for less."

**specific pain points to name:**
- BetterCampus: 2 study sets/month, 3MB notes, chrome only, chat not saved → all free and unlimited
- RemNote: €18/month for AI, zero canvas awareness → OghmaNotes is €10 and knows your deadlines, grades, and assignments

**user acquisition playbook:**
1. BetterCampus revolt posts (April 2026) — reply in threads with a direct comparison, no hard sell
2. "Quizlet alternatives" — active Reddit search term, OghmaNotes slots in with FSRS as the differentiator
3. CompSoc UoG — first cohort, word-of-mouth within courses
4. "Anki but with AI and Canvas" — r/GetStudying, r/medicalschool framing
