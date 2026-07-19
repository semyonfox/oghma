# Product Roadmap

> **Status:** Current planning
> **Last reviewed:** 2026-07-20
> **Source of truth for:** Product outcomes, phase order, and feature sequencing. Launch gates live in [launch-checklist.md](launch-checklist.md); prices and allowances live in [pricing.md](pricing.md).

OghmaNotes is a functional Canvas-connected study workspace preparing for a controlled beta. The roadmap advances when the previous phase has produced useful evidence, not merely when a target date arrives.

## Where The Product Stands (July 2026)

Working today: Canvas import with direct extraction and an OCR fallback, Qdrant-backed cited search and chat with persisted tool activity, flashcards with FSRS review, assignment/time-block/Pomodoro planning with a persistent focus timer, vault import and export, complete locale coverage, and the public agent discovery surfaces described in [agent-compatibility.md](../engineering/agent-compatibility.md).

Not yet done: the hard beta blockers in the [launch checklist](launch-checklist.md) — end-to-end verification of a production Canvas import ([#304](https://github.com/semyonfox/oghma/issues/304)), transactional email ([#305](https://github.com/semyonfox/oghma/issues/305)), secret rotation ([#306](https://github.com/semyonfox/oghma/issues/306)), and backup/monitoring coverage ([#328](https://github.com/semyonfox/oghma/issues/328)). No beta invitation goes out before those close.

The core loop every phase measures is: **connect Canvas → import course material → reach a cited answer or generated flashcards → return for another study session.** "Activation" below means completing that loop once; "retention" means repeating it across sessions.

## The Semester Clock

Phases advance on evidence, but a semester product has external windows the evidence must land inside:

- **Early September 2026** — Semester 1 begins. The "whole semester, already loaded" moment is strongest in the first weeks of term, when students have fresh courses and empty workspaces. The controlled beta must be live then to produce real evidence; missing it pushes equivalent conditions to late January 2027.
- **December 2026 and April–May 2027** — Exam seasons. Peak flashcard and review usage, and the worst time to break imports or run risky migrations. Treat them as change-freeze windows for anything touching import, retrieval, or review data.
- **Late January 2027** — Semester 2 begins. The natural soft-launch window if the September beta produces exit evidence, and the fallback beta window if it does not.

A window disciplines sequencing; it does not override exit evidence. A phase that misses its window waits for the next one rather than shipping unready.

## Product Principles

- Make Canvas import dependable before expanding the feature surface.
- Lead with student outcomes, not implementation terms such as RAG, embeddings, or OCR.
- Keep indexing progress, limits, and failure states honest.
- Prefer improvements that use data already available in the product.
- Preserve export and deletion paths so students are not locked in.
- Let observed activation, retention, support load, and processing cost determine later work.

## Phase 0: Beta-Ready Foundation

**Outcome:** A new student can understand the product, connect Canvas, import supported material, and reach a useful study action without founder intervention.

Product priorities:

- Build first-run onboarding for empty workspaces and Canvas connection ([#314](https://github.com/semyonfox/oghma/issues/314)).
- Make long OCR and indexing waits visible and understandable.
- Show import preflight estimates and require confirmation for unusually large backlogs ([#327](https://github.com/semyonfox/oghma/issues/327)).
- Improve assignment scanning with type icons and clearer states ([#315](https://github.com/semyonfox/oghma/issues/315)).
- Surface friendly, actionable errors instead of raw failures.

The operational, security, legal, and manual-QA requirements for this phase are maintained only in the [launch checklist](launch-checklist.md).

## Phase 1: Controlled Beta

**Audience:** A small, invited student cohort — on the order of 10–25 students, small enough to interview individually and to recover every failed import by hand. Cohort selection and support-channel requirements live in the [launch checklist](launch-checklist.md) rollout section.

**Outcome:** Establish whether Canvas import works across real courses and whether students reach the core loop repeatedly.

Learn:

- Which institution and course configurations import reliably.
- How long students will tolerate background processing when progress is clear.
- Which first actions lead to cited answers, generated flashcards, or planning activity.
- Where onboarding, terminology, and recovery paths fail.

Likely product work:

- Refine onboarding from observed drop-off.
- Surface recent graded Canvas feedback only after its data coverage and UI are verified ([#316](https://github.com/semyonfox/oghma/issues/316)).
- Improve task scanning and import recovery based on beta sessions.

Exit evidence:

- Representative users complete the core loop.
- Funnel data and interviews identify the main activation and retention constraints.
- Common import failures have a documented recovery path.

## Phase 2: Soft Launch

**Audience:** The first broader student cohort — on the order of 100 students, large enough for funnel data to mean something while support remains one person's job.

**Outcome:** Validate repeat semester use, willingness to pay, and supportability without sacrificing import reliability. The conversion moment to measure is the free "semester appears" experience defined in [pricing.md](pricing.md) leading to a paid semester purchase.

Candidate work, ordered by evidence:

1. Faster drag-to-plan interactions for assignments and time blocks ([#317](https://github.com/semyonfox/oghma/issues/317)).
2. Contextual study help, such as Socratic quiz hints and simple explanations, with clear model limits ([#318](https://github.com/semyonfox/oghma/issues/318), [#319](https://github.com/semyonfox/oghma/issues/319)).
3. Inline flashcard creation from notes ([#320](https://github.com/semyonfox/oghma/issues/320)).
4. Exam-date-aware review scheduling ([#321](https://github.com/semyonfox/oghma/issues/321)).
5. Per-task labels and other lightweight organisation controls.
6. Bring-your-own-key model access if it materially lowers cost without weakening security ([#322](https://github.com/semyonfox/oghma/issues/322)).

Exit evidence:

- Students return across multiple study sessions.
- Import and AI usage fit the allowance model.
- Support and incident load remain manageable.
- Paid conversion can be measured without obscuring product failures.

## Phase 3: Sustainable Growth

**Outcome:** Grow beyond the initial university cohort while keeping the service self-funding and trustworthy.

Candidate work:

- Anki-compatible import and export ([#323](https://github.com/semyonfox/oghma/issues/323)).
- Direct calendar synchronisation where users ask for more than iCal subscriptions ([#324](https://github.com/semyonfox/oghma/issues/324)).
- Section-aware summaries and section-scoped flashcards for large documents ([#325](https://github.com/semyonfox/oghma/issues/325)).
- Advanced FSRS progress and workload views.
- Achievements for streaks, reviews, imports, and planning milestones ([#326](https://github.com/semyonfox/oghma/issues/326)).
- Shared study sets after permissions and moderation are designed.

Infrastructure should scale from measured queue age, latency, and capacity. Product sequencing should not assume a particular cloud or GPU vendor.

## Engineering Tracks

These run alongside the phases above, each gated by its own owner document rather than by a phase boundary:

- **Unified writing surface.** A feature-flagged Milkdown Crepe prototype is the candidate replacement for the CodeMirror live-preview editor; Markdown stays canonical. Requirements, spike scope, and release gates live in the [editor migration handover](../engineering/markdown-editor-migration-handover.md). CodeMirror remains production until those gates pass.
- **Extraction cost path.** OCR is a top margin risk in [pricing.md](pricing.md). Hosted Marker vision integration landed and was benchmarked in July 2026; the fork-versus-PyPI serving decision is owned by the Marker++ benchmark analysis in its separate repository. Decide the serving path before paid launch, from measured throughput and minimum-billing waste.
- **Agent surfaces.** Close the gaps recorded in [agent-compatibility.md](../engineering/agent-compatibility.md): a public remote MCP server with user OAuth and narrowed tools, a spam-resistant contact-intent endpoint, and stronger OpenAPI response schemas. Discovery must never grant authority.

## Pause Conditions

Advancing is not the only decision this roadmap owns; each phase also has conditions for stopping intake or descoping. Pause new invitations or imports when any of these holds, and resume only after the cause is fixed and verified:

- Import failure or recovery work exceeds what one maintainer can handle alongside development.
- Recurring processing cost per active student breaches the guardrails in [pricing.md](pricing.md) and no allowance or routing change closes the gap.
- A data-safety incident occurs, or the backup/restore rehearsal required by the [launch checklist](launch-checklist.md) is stale.
- A target institution objects to the Canvas connection method; stop marketing there until the permission question is resolved.

The homelab remains user-facing infrastructure during beta. Its capacity and failure posture are owned by the launch checklist and infrastructure index; if it degrades, pausing signups is the default response, not emergency migration.

## Later Opportunities

These remain discovery topics rather than committed deliverables:

- Additional LMS integrations (Moodle, Brightspace) once the Canvas loop is proven; this is the main expansion axis beyond Canvas institutions.
- Lecture transcription.
- Image-occlusion flashcards.
- Offline-first editing and synchronisation.
- Institution licensing, SSO, and procurement support.

Promote an item into an active phase only when user evidence, operating cost, privacy implications, and maintenance ownership are understood.

## Review Cadence

Rereview this roadmap at each semester boundary (September, January, May), after any phase exit, and whenever a pause condition fires. Update **Last reviewed** only after substantively rechecking its claims against the launch checklist, pricing plan, and open issues.
