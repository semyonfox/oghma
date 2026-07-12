# Product Roadmap

> **Status:** Current planning
> **Last reviewed:** 2026-07-11
> **Source of truth for:** Product outcomes, phase order, and feature sequencing. Launch gates live in [launch-checklist.md](launch-checklist.md); prices and allowances live in [pricing.md](pricing.md).

OghmaNotes is a functional Canvas-connected study workspace preparing for a controlled beta. The roadmap advances when the previous phase has produced useful evidence, not merely when a target date arrives.

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

- Improve the empty-workspace and first-Canvas-connection experience.
- Make long OCR and indexing waits visible and understandable.
- Show import estimates and require confirmation for unusually large backlogs.
- Improve assignment scanning with type cues and clearer states.
- Surface friendly, actionable errors instead of raw failures.

The operational, security, legal, and manual-QA requirements for this phase are maintained only in the [launch checklist](launch-checklist.md).

## Phase 1: Controlled Beta

**Audience:** A small, invited student cohort.

**Outcome:** Establish whether Canvas import works across real courses and whether students reach the core study loop repeatedly.

Learn:

- Which institution and course configurations import reliably.
- How long students will tolerate background processing when progress is clear.
- Which first actions lead to cited answers, generated flashcards, or planning activity.
- Where onboarding, terminology, and recovery paths fail.

Likely product work:

- Refine onboarding from observed drop-off.
- Add recent graded-assignment feedback only after its data coverage and UI are verified.
- Improve task scanning and import recovery based on beta sessions.

Exit evidence:

- Representative users complete the core Canvas-to-study flow.
- Funnel data and interviews identify the main activation and retention constraints.
- Common import failures have a documented recovery path.

## Phase 2: Soft Launch

**Audience:** The first broader student cohort.

**Outcome:** Validate repeat semester use, willingness to pay, and supportability without sacrificing import reliability.

Candidate work, ordered by evidence:

1. Faster drag-to-plan interactions for assignments and time blocks.
2. Contextual study help, such as quiz hints and simple explanations, with clear model limits.
3. Inline flashcard creation from notes.
4. Exam-date-aware review scheduling.
5. Per-task labels and other lightweight organisation controls.
6. Bring-your-own-model access if it materially lowers cost without weakening security.

Exit evidence:

- Students return across multiple study sessions.
- Import and AI usage fit the allowance model.
- Support and incident load remain manageable.
- Paid conversion can be measured without obscuring product failures.

## Phase 3: Sustainable Growth

**Outcome:** Grow beyond the initial university cohort while keeping the service self-funding and trustworthy.

Candidate work:

- Anki-compatible import and export.
- Direct calendar synchronisation where users ask for more than iCal subscriptions.
- Section-aware study generation for large documents.
- Advanced FSRS progress and workload views.
- Shared study sets after permissions and moderation are designed.

Infrastructure should scale from measured queue age, latency, and capacity. Product sequencing should not assume a particular cloud or GPU vendor.

## Later Opportunities

These remain discovery topics rather than committed deliverables:

- Lecture transcription.
- Image-occlusion flashcards.
- Offline-first editing and synchronisation.
- Automatic summaries for imported course material.
- Institution licensing, SSO, and procurement support.

Promote an item into an active phase only when user evidence, operating cost, privacy implications, and maintenance ownership are understood.
