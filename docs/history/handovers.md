# Handover Outcomes

> **Status:** Historical record; not a runbook
>
> **Last reviewed:** 2026-07-22
>
> **Source of truth:** The dated handovers consolidated here, their referenced commits, migrations, and current code

This file retains durable outcomes and unresolved gaps from superseded handovers. Volatile prices, image tags, machine-local paths, temporary worktree lists, and obsolete commands were intentionally removed.

## 2026-06-25 to 2026-07-03 — chat lifecycle, settings, and Marker work

### Marker and RunPod OCR

Durable outcomes:

- A repeatable optional RunPod Marker service was added under `infra/runpod-marker/`, with bearer authentication, health checks, upload limits, page-range support, and benchmark tooling.
- That RunPod directory was later made machine-local and gitignored. It may be
  present on this workstation, but it is not part of a fresh checkout or a
  current deployment contract.
- The application-side OCR client supports `MARKER_API_URL`, `MARKER_API_TOKEN`, and an optional `MARKER_PAGE_RANGE`.
- Page-limited OCR was useful for responsive previews, while full-document runs showed significant PDF/CPU work around GPU inference. One dated B200-class sample found request concurrency 8 better than 4 or 12 for a 24-document, three-page workload; this is evidence, not a capacity guarantee.
- Migration `033_extraction_coverage.sql` made partial page-range extraction queryable. The Marker response reports the applied page range, preventing a partial result from being silently described as full coverage.
- At the time of the handover, the serving images installed released Marker packages rather than the experimental Marker++ fork. Fork findings therefore did not prove live behaviour.

Open gaps retained from the handover:

- A successful partial preview still does not automatically schedule full-document enrichment.
- Long OCR requests need a direct or asynchronous integration; a short-lived HTTP proxy is not a reliable full-document job API.
- Cross-path benchmarks require the same Marker version and configuration before results are comparable.
- Tune thread and batch settings with repeatable workloads before choosing hardware by VRAM alone.

Current setup and commands belong in the Marker infrastructure README, not this history.

## 2026-07-16 to 2026-07-22 — Marker corpus evidence and launch posture

The later Marker work moved canonical performance analysis to the separate
`marker++` repository while retaining the Oghma-owned benchmark harness and
hosted-vision adapter. Durable outcomes:

- The benchmark matrix uses immutable, non-interchangeable identities: Marker
  1.10.2, early Marker++ cells at `2d66e45`, hosted/matched cells at `72f3776`,
  and diagnostic instrumentation at `e47790d`. Mixed revisions are experiment
  provenance, not an accidental version floor.
- A 647-page, 24-document corpus measured A10G/two-worker throughput at
  1.5375 pages/second. The same reports retain the T4 and L4 comparisons,
  quality limits, costs, and private-artifact boundaries; do not copy only the
  winning number into an operational promise.
- A July 18 hosted-Qwen preview completed 9/9 pages at concurrency one in
  108.721 seconds (0.082781 pages/second). Concurrency ten completed only 6/9
  pages in 469.062 seconds (0.012791 pages/second) before the queued-work idle
  guard invalidated it. The latter throughput was 84.55% lower, and incomplete
  request accounting cannot be read as avoided calls.
- On July 20, Marker became explicit opt-in in application code and the
  production template. Jenkins additionally forces `MARKER_OCR_ENABLED=false`
  in deployed containers, so current deployed extraction uses the local text
  layer and leaves scanned/image-only PDFs unsearchable rather than invoking a
  GPU service.
- By July 22, upstream Marker had reached 2.0.0. Marker++ integration commit
  `b95312f` merged that upstream history and ported the fork controls onto a
  distinct `2.0.0+markerpp.1` package. Oghma's benchmark and Docker identities
  deliberately remain on 1.10.2: the integrated branch has not completed the
  T4/full-corpus quality benchmark and is not yet a serving decision. Retired
  AWS userdata has open-ended installs and is not a comparable serving path.
- A July 22 quick baseline then ran that exact merged image over 15 opaque,
  production-derived single pages with no hosted LLM. On one 24 GB RTX PRO
  4000 Blackwell, warm balanced/concurrency four reached 1.257 pages/second and
  fast/concurrency two reached 1.513 pages/second; higher concurrency regressed
  both operating points. This is throughput and divergence evidence only, not
  a scored quality result. Its canonical report lives under Marker++
  `benchmarks/results/2026-07-22-quick-prod-notes-baseline.md`.
- A same-day local fast-start rebuild retained Marker++ 2.0, vLLM 0.20.1,
  Torch 2.11/CUDA 13, the precompiled FlashInfer cubins, and all baked models,
  while removing the stock vLLM image's universal JIT cache and unused NIXL
  connectors. The final generic image is 10.73 GB (58.2% below the 25.67 GB
  baseline); the 4090/L4-class build removes unused Blackwell cubins and is
  9.51 GB (62.9% below baseline). Pip downloads are excluded from runtime
  layers, and a no-change final-image rebuild completed in 1.61 seconds.
  Offline model resolution, runtime imports, lazy queue-handler startup, and
  CPU model loading passed; GPU cold startup and
  throughput have not yet been measured, and no Pod or endpoint was created.
  The local image recipe remains under the deliberately ignored
  `infra/runpod-marker/` experiment directory; the Marker++ handover is the
  canonical current record.
- A read-only, anonymized production aggregate found two large Canvas-backed
  accounts with about 330 PDFs each. At the measured corpus mean of 26.96
  pages/PDF, the representative first import projects to roughly 8,900 pages;
  the user confirmed two-to-six academic years arrive in that initial burst.
  This favours a queue-based, scale-to-zero worker with bounded per-document
  jobs. It does not justify an always-warm GPU or one account-sized retry unit.

Current benchmark/provisioning boundaries are indexed in
[`../../infra/marker/README.md`](../../infra/marker/README.md). Canonical
measurements and the provider decision remain in Marker++ as directed by the
[documentation index](../README.md).

### Chat stream lifecycle

Commit `28b67dd` made stream termination explicit:

- the server emits a `done` SSE event and logs stream lifecycle data;
- the client distinguishes clean completion from a body that closes early;
- partial assistant drafts can be preserved during interruption;
- parsing support and tests cover the completion event.

The strict `done` contract is valuable because it makes truncation visible. Any proxy or fallback path that omits it will surface an error, so integration coverage should accompany future stream transports. Logging verbosity must remain appropriate for production and must not expose message content or secrets.

### Server-managed AI settings

The settings work exposed the server-selected LLM model while refusing per-user model persistence during beta. Disabled future choices and BYOK affordances were presentation only. Before relying on that behaviour, verify the current settings API and UI because model policy is a product decision rather than a migration invariant.

## 2026-06 — structured chat message parts

Migration `028_chat_message_parts.sql` added non-null JSONB `parts` to `app.chat_messages`, backfilled existing content as a text part, and retained `content` as the canonical plain-text representation used by model history and search.

Structured parts allow tool indicators—and now other typed UI parts—to survive reload without encoding them into Markdown prose. The durable compatibility rules are:

- legacy text-only rows continue to render;
- `content` remains usable independently of `parts`;
- streaming and reloaded rendering should produce equivalent message structure;
- migration presence in the repository does not prove it ran on a particular database; check `app.schema_migrations` and the live column definition.

## 2026-07-08 to 2026-07-09 — canonical Markdown editor decision

Commit `3bb62096` recorded the decision to keep canonical Markdown and CodeMirror 6 rather than migrate the main editor package. The product target is one Notion-like writing surface in which Markdown syntax is available without forcing ordinary users into source/preview modes.

The renderer work proposed by the original handover was subsequently implemented:

- shared note/chat/quiz renderer variants;
- safe raw-HTML policy and sanitization;
- richer code-block chrome and fence metadata;
- lazy Shiki highlighting with aliases and plaintext fallback;
- renderer contract fixtures and security tests.

MDX is not the note format. A Markdown-first alternative such as Milkdown may be evaluated in an isolated spike only if CodeMirror reaches a demonstrated UX ceiling. The current contract is maintained in [`../engineering/markdown-rendering.md`](../engineering/markdown-rendering.md).

## 2026-07-12 — agent compatibility integration

This session reconciled upstream privacy-first analytics work, a rebased local
Markdown decision, and a stronger agent-discovery implementation recovered from
T3 checkpoint history.

Durable outcomes:

- The dirty tree was protected with named stashes and a backup branch before
  the upstream rebase. Those references were session safety evidence; their
  current existence and numbering must be checked in Git rather than inferred
  from this record.
- The stronger agent implementation was recovered from checkpoint `49005951`
  after comparing it with base `0de1e731`. The affected files had not diverged,
  so the focused delta applied without overwriting newer upstream work.
- Public agent resources now have purpose-specific Markdown/plain-text
  variants, OpenAPI operation metadata and safety hints, alternate discovery
  links, sitemaps, and content negotiation.
- Public discovery remains separate from authority to act. A public remote MCP
  server and spam-safe contact-intent API remain deliberately out of scope.
- The focused agent-content, Markdown negotiation, and sitemap/robots suites
  passed: 3 test files and 11 tests. Focused lint and `git diff --check` also
  passed at that point.
- Re-verification on 2026-07-12 confirmed the recovered content/test files still
  match checkpoint `49005951`; `src/proxy.ts` is semantically identical after
  ignoring line-ending normalization. The same 3 files and 11 tests, plus
  focused lint, passed again.
- The clean linked worktree for merged analytics commit `485c44ed` was removed
  after confirming the commit is an ancestor of `origin/dev`; its local
  `agent/quiz-answer-normalization-20260711T2100` branch was deleted.

The detailed file state, stash instructions, and suggested next phase were
time-bound handoff material and were removed during documentation
consolidation. The maintained capability and safety contract is
[Agent compatibility](../engineering/agent-compatibility.md).
