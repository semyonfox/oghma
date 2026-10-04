# Study maps

> **Status:** Implemented on the feature branch; release verification tracked below
> **Last reviewed:** 2026-10-04
> **Source of truth for:** Study Map persistence, classification, evidence, and exam-history contracts

Study maps organise existing notes and files around reviewed module topics. The canvas is a view of those records. Topic membership, card placement, and labelled links are separate. Exam history describes reviewed uploaded papers; it does not measure student mastery or predict the next exam.

## Using a map

1. Open `/study-map` and create a module with an academic year. Optionally select a root folder, Canvas course ID, and syllabus note. Add materials explicitly or use **Sync sources** to discover descendants and matching course materials.
2. Choose **Propose syllabus topics**, then review each definition, inclusion criteria, exclusions, aliases, hierarchy, and supporting quotations. Topics can also be added manually. Classification requires at least one approved topic.
3. Choose **Classify materials**, or classify one material in its inspector. Review independent core/supporting suggestions and save corrections. Document kind and labels remain editable.
4. Use material filters and search to find related work. On the board, arrange live source cards in frames, pin selections, add labelled connectors, and optionally draw or add sticky notes. **Add to board** restores a removed reference; **Find selected** locates it. Moving a card into a frame changes its layout only. Its topic assignments remain in the inspector.
5. In **Exam history**, analyse a past paper, check its year, sitting, syllabus version, questions, marks, topic assignments, and section rules, then approve the review. Resolve source or taxonomy changes before using its statistics again.

Provider calls require an explicit proposal, classification, or paper-analysis action. Automatic classification defaults off and requires the **Classify changed materials automatically** checkbox in module settings. With a live provider, these actions can incur charges. Automatic suggestions still require review; saved corrections survive reruns.

## Persistence and ownership

[Migration 071](../../database/migrations/071_study_maps.sql) adds four tables. Its presence does not prove it has run in a particular environment.

| Table             | Owns                                                                                                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `study_maps`      | Module identity, source selection, bounded topic catalogue, taxonomy version, map revision, board revision, drawing scene, legacy placements/links/viewport, automatic-classification opt-in |
| `study_materials` | Membership and exclusions, document kind, labels, suggested associations, raw classification result, source hash, taxonomy version, separate manual overrides                                |
| `study_papers`    | Source hash, taxonomy version, reviewed flag, structured questions and section choices                                                                                                       |
| `study_jobs`      | Durable pending/running/completed/failed work, attempts, lease expiry and token                                                                                                              |

Composite foreign keys bind maps, materials, papers, jobs, and extraction relationships to the same owner. Queries additionally require active, visible notes and omit import-cache sources. Removing a material excludes it from the map and invalidates active jobs; deleting the map cascades its records while preserving library notes.

`types.ts` supplies Zod contracts. `mutations.ts` validates topic IDs, unique names, parent cycles, source anchors, board endpoints, and submitted versions under transactions. Map edits use `version`; board saves use `boardVersion`. A conflicting edit returns 409 instead of overwriting newer work.

Unsaved layouts remain in a per-map draft and browser `sessionStorage`, including the saved revision they started from. Switching modules or refreshing restores that draft for the session. Server refreshes prune removed cards and links but preserve local movement. A newer server board revision produces a conflict; saving is blocked until the user explicitly discards the draft and reloads. Session caching does not replace saving to Postgres.

Topic meaning changes increment `taxonomyVersion` and stale prior results. The comparison includes IDs, definitions, inclusion/exclusion criteria, aliases, and approval state. Names and parent placement are presentation changes in this comparison. The worker rechecks source, map, taxonomy, membership, and lease before publishing. Snapshot reads calculate staleness against current source text; study search excludes stale topic and label associations.

Changing, deleting, hiding, or oversizing a cited syllabus source also invalidates the affected topic's effective approval, even before the catalogue is edited. Snapshots retain the definition for review, paper review becomes ineligible, and search omits associations to that topic. Classification and paper jobs validate approved topic anchors at enqueue, input loading, and publication; stale evidence blocks processing until reviewed. Saving material or paper reviews also validates current topic evidence.

Manual overrides are stored separately with the reviewed source hash and taxonomy version. Reruns update automatic results without replacing overrides. Changed sources or topic meaning leave those corrections visible for review, but their topic decisions no longer apply until reviewed again.

## Board scene and source cards

[study-drawing-board.tsx](../../src/components/study-map/study-drawing-board.tsx) embeds Excalidraw 0.18.1. Reference elements store only an owned note or topic ID in `customData.studyRef`; their React cards resolve the current material or definition from the map snapshot. Cards show excerpts, review state, topic evidence, original-source links, and lazy signed image or first-page PDF previews. Removing a card preserves its library material. New materials appear beside the existing drawing rather than rearranging it.

In selection mode, card buttons and links respond directly while the card body remains draggable. A selected source card hides the drawing-style panel. PDF loading uses the card's own loading and error messages. [React-PDF 11 suspends by default](https://github.com/wojtekmaj/react-pdf/wiki/Upgrade-guide-from-version-10.x-to-11.x); opting out keeps that loading from hiding and reinitialising the surrounding drawing editor.

The saved scene holds frames, shapes, text, freehand strokes, arrow bindings, locked selections, and a bounded camera state. Pins use element locks. Manual **Connect** arrows and **Add link** labelled connectors stay independent of classification. Excalidraw supplies undo/redo during the editing session; saving persists the scene, not a durable undo history. Maps without a scene restore their previous placements and links into the new board on first opening.

[board-scene.ts](../../src/lib/study-map/board-scene.ts) validates the supported element subset: at most 2,000 elements, 20,000 total points or bindings, and 2,000,000 UTF-8 bytes of scene JSON. Deleted elements retained for editing history count toward these limits. Unsupported or oversized changes block saving with an undo/remove message. Source references must remain available in the owned map; pruning also clears broken frame and arrow bindings.

Upload images and PDFs through **Add materials**, then add their live cards to the board. File drops, arbitrary image paste, external iframe embeds, and scene import/export are disabled. The board uses its own validated Excalidraw scene; it does not implement JSON Canvas interchange or shared live editing.

[stage-study-board-assets.mjs](../../scripts/stage-study-board-assets.mjs) runs before development and production builds. It stages bundled fonts under `/study-board-assets/fonts/`, excluding Liberation, and copies the notices from [third_party/study-board](../../third_party/study-board/) to `/study-board-assets/licenses/`. The client sets `EXCALIDRAW_ASSET_PATH` before loading the editor. A small version-guarded patch also changes Excalidraw's development and production font fallback to that same origin: Chromium checks even unused `FontFace` fallback URLs against CSP, so leaving the CDN fallback caused repeated errors. CSP stays unchanged. The script fails on a version or bundle mismatch; review this patch when upgrading the editor.

## Evidence and extraction

`evidence.ts` hashes the exact source field and text together. Anchors hold the canonical note ID, `content` or `extracted_text`, SHA-256 hash, JavaScript string offsets, exact quote, line, and optional page. Repeated text keeps separate occurrences. Anchor validation checks the hash, substring, and location. RAG chunk IDs are never evidence identities.

Markdown and text use `notes.content`. Binary files use `extracted_text`, unless an active owned Markdown note explicitly points to the original through `extracted_from_note_id`; that Markdown content becomes the preferred analysis source. Import paths record this relationship and the inspector exposes linked file/note references. Filenames alone do not establish a pair. Page numbers require explicit page markers in the extracted text, so an anchor can have a line without a reliable PDF page.

Original-file and extraction views select the same canonical text for source hashes, evidence, and search. Editing the linked Markdown makes prior results stale in either view. Access checks apply to both records; a missing or inaccessible extraction falls back to the original's extracted text. Attachments and embedded references remain owned library records.

Sources above 320,000 characters or 250 passages fail with a split-material message. Classification splits at headings and paragraph boundaries, then bounds requests to 24 questions, three passages, and 20,000 encoded bytes. Generation has a separate 100,000-character context limit and does not silently truncate text. Maps support 80 topics and 500 materials; one user can have 100 maps. These are implementation limits, not provider guarantees.

## Providers and worker

`config.ts` selects `STUDY_CLASSIFIER_PROVIDER=mock|jev|generative`, defaulting to `jev`. Jev credentials resolve from `JEV_API_KEY`, then `OPENROUTER_API_KEY`, then `LLM_API_KEY` only when the configured LLM URL is OpenRouter. Topic proposals and paper extraction use the existing LLM configuration through `createLlmProvider` and `getLlmModel`; a Jev key alone does not enable generation.

`classification.ts` asks an independent `CORE`, `SUPPORTING`, or `UNRELATED` Choice for each passage/topic pair, plus document-kind Choice and label Nouls. Several topics can apply. Jev responses preserve model IDs, raw decisions, probabilities, optional confidence, token usage, and nullable cost. Generative classification returns categorical decisions with no invented probability or confidence. Results remain suggestions. The current relevance and label thresholds, 0.6 and 0.65, are provisional and have not established course-specific accuracy.

`jobs.ts` runs provider calls outside publish transactions. The existing import worker polls study jobs every five seconds and reconciles opted-in maps every 60 seconds, catching imported or changed materials without making source saves wait for classification. Claims use `FOR UPDATE SKIP LOCKED`, a five-minute lease, and a 30-second heartbeat. Expired claims return to pending until three attempts, then fail for manual retry. One enqueue is capped at 50 jobs, with 100 active jobs per user. Automatic reconciliation skips a material whose latest job failed.

See [the worker runbook](../operations/import-worker.md) for worker operation. Study jobs use Postgres persistence alongside the existing BullMQ worker; they do not introduce another service.

## Exam accounting

`generation.ts` proposes a source-quoted question tree and section instructions; `exam-stats.ts` calculates its statistics in code. Parent and child marks reconcile without counting both. Missing marks remain unknown. Supported choices select whole root questions independently within sections. Nested or conditional choices require manual resolution and remain unavailable when the represented rules cannot be validated.

Three 20-mark questions with "answer any two" have 60 printed marks and 40 answerable marks. Topic answerable ranges reflect legal selections rather than assuming a student chooses randomly. A multi-topic marked unit records shared marks for each associated topic; shared columns are overlapping and must not be summed across topics as a paper total. Exclusive marks remain separate.

Corpus totals require reviewed, current, structurally valid papers. Source changes, taxonomy changes, unknown topic IDs, and a selected syllabus-version mismatch exclude a paper. Identical source hashes count once; different files for the same year and sitting produce a warning for review. Paper frequency divides topic-bearing eligible papers by all eligible papers. Unreviewed, unresolved, and duplicate counts remain visible. Extraction warnings and completeness still need human review.

## Disposable local setup

Use [docker-compose.study-map.yml](../../docker-compose.study-map.yml), which binds services to localhost and uses dedicated volumes. The existing `mock:up` and `mock:down` scripts target the general E2E stack, not this stack.

Create `.env.mock` from [the public mock example](../../.env.mock.example) if it does not already exist. Keep its synthetic authentication and seeded-login values, then set these Study Map overrides. These credentials are public disposable fixtures from the Compose file.

```dotenv
DATABASE_URL=postgresql://study_map:postgres@127.0.0.1:55488/oghma_study_e2e?search_path=app,public
MIGRATION_DATABASE_URL=postgresql://study_map:postgres@127.0.0.1:55488/oghma_study_e2e?search_path=app,public
REDIS_HOST=127.0.0.1
REDIS_PORT=56388
QDRANT_URL=http://127.0.0.1:56389
QDRANT_COLLECTION=oghma_study_mock_chunks
STORAGE_ENDPOINT=http://127.0.0.1:59108
STORAGE_BUCKET=oghma-study-e2e
STORAGE_ACCESS_KEY=oghmastudy
STORAGE_SECRET_KEY=oghmastudy-test
LLM_API_URL=http://127.0.0.1:58188/v1
EMBEDDING_API_URL=http://127.0.0.1:58188/v1
RERANK_API_URL=http://127.0.0.1:58188/v1
STUDY_CLASSIFIER_PROVIDER=mock
QUEUE_PREFIX=study-map-mock
```

The public example keeps the mock app at `http://127.0.0.1:3311`. Keep its fake-provider keys and remaining storage settings. `run-mock.ts` loads `.env.mock.local` after `.env.mock`, and existing shell variables win over both. Check the effective target configuration before resetting; never reuse production or ordinary development targets.

```sh
docker compose -f docker-compose.study-map.yml up -d --wait
node --experimental-strip-types scripts/dev/run-mock.ts node --experimental-strip-types scripts/e2e/reset-db.ts
node --experimental-strip-types scripts/dev/run-mock.ts node --experimental-strip-types scripts/e2e/create-storage-bucket.ts
node --experimental-strip-types scripts/dev/run-mock.ts npm exec --no -- tsx scripts/dev/seed-study-map.ts
```

**Reset is destructive.** `reset-db.ts` drops and recreates the configured database's `app` schema, deletes/recreates the configured Qdrant collection, and flushes the configured Redis database. Its database guard requires a name containing `e2e` and a local-style hostname unless explicitly overridden. This does not prove Qdrant or Redis are disposable. Use only the dedicated endpoints above; do not bypass the guard.

For a new separate mock session, use `npm run dev:mock` and, in another terminal, `node --experimental-strip-types scripts/dev/run-mock.ts npm run worker`. Preserve the already-running normal development server. Mock classification permits only a local database whose name contains `e2e`. Topic proposals expect Markdown headings followed by definition paragraphs; mock papers expect section/question headings with explicit marks and choice instructions. Mock results exercise the workflow, not classifier quality.

`seed-study-map.ts` requires the dedicated loopback database and storage ports above, mock classification, and the synthetic reset user. It creates Operating Systems and Database Systems maps for 2025/26, each with six reviewed topics. Operating Systems includes 12 study notes, a linked PDF/Markdown lecture pair, an SVG diagram and embedded reference, reviewed and suggested material associations, a note edited after review, and a pinned card. Its four papers include two compatible reviewed summer papers, one awaiting review, and one reviewed paper from an older syllabus. Database Systems supplies four study notes with mixed reviewed/suggested associations. Reruns preserve completed maps and resume unfinished ones; the seed itself does not reset the database.

## Private preview

A private preview can proxy the separate mock app through [Tailscale Serve](https://tailscale.com/docs/reference/tailscale-cli/serve). Before adding it, inspect `tailscale serve status` and local listeners to confirm HTTPS port 8448 is unused. If occupied, choose an unused port and use it consistently. Preserve existing routes and the normal development server.

For a production preview, build with `NEXT_PUBLIC_API_URL=` so browser requests use the current origin. A build pinned to loopback prevents login through the tailnet address. Use the standalone entrypoint and copy its public assets:

```sh
NEXT_PUBLIC_API_URL= NODE_ENV=production node --experimental-strip-types scripts/dev/run-mock.ts npm run build
cp -a public .next/standalone/
cp -a .next/static .next/standalone/.next/
HOSTNAME=127.0.0.1 PORT=3311 NODE_ENV=production NEXT_PUBLIC_API_URL= node --experimental-strip-types scripts/dev/run-mock.ts node .next/standalone/server.js
```

The dedicated database password defaults to the disposable `postgres` fixture. `STUDY_MAP_DB_PASSWORD` can override it for a fresh Compose volume; keep both database URLs consistent with that value. Changing the Compose variable does not change the password inside an existing Postgres volume.

```sh
tailscale serve status
ss -ltn 'sport = :8448'
tailscale serve --bg --https=8448 http://127.0.0.1:3311
tailscale serve status
```

Use the private HTTPS origin printed by Serve in the isolated mock app's public URL, authentication, and CORS configuration where required, including the dedicated storage stack's `STUDY_MAP_CORS_ALLOWED_ORIGINS`. This route is for tailnet access. Do not enable Funnel or change DNS, tailnet policy, or existing hosting routes. No hostname or live preview is asserted by this example.

Remove only the route created above when finished, using the same flags and target. Do not use `tailscale serve reset`.

```sh
tailscale serve --bg --https=8448 http://127.0.0.1:3311 off
tailscale serve status
```

## Synthetic classifier evaluation

[evaluate-study-classifier.ts](../../scripts/dev/evaluate-study-classifier.ts) has 12 single-passage cases and four reviewed topic definitions. It exercises overlapping topics, supporting prerequisites, incidental mentions, a word collision, negation, and quoted prompt injection. Reports include topic probabilities, core/supporting/unrelated confusion counts, five probability bands, errors, and observed token/cost totals. The fixtures' expected labels are hypotheses; this sample cannot establish course-specific calibration.

```sh
npm exec --no -- tsx scripts/dev/evaluate-study-classifier.ts --help
node --experimental-strip-types scripts/dev/run-mock.ts npm exec --no -- tsx scripts/dev/evaluate-study-classifier.ts --provider mock --report /tmp/study-classifier-mock.json
```

Mock mode validates the runner and lexical fixtures without contacting a provider or connecting to the database. Its environment guard still requires a local E2E database URL. Report paths must be new `.json` files in the workspace or `/tmp`; existing files are never overwritten.

The optional live command uses the configured Jev credential from the environment. It can spend money and is not part of setup or the mock run. No live evaluation has been run for this implementation; no evaluation key was created and no paid evaluation calls were made.

```sh
npm exec --no -- tsx scripts/dev/evaluate-study-classifier.ts --provider jev --allow-paid --max-calls 12 --report /tmp/study-classifier-jev.json
```

`--max-calls` accepts 1–20 and caps HTTP attempts, including retries. Each case has 11 questions; input is guarded at 15,000 bytes per request. A 12-attempt run can finish fewer than 12 cases if retries occur. This is not a dollar cap, failed requests may incur charges, and missing usage remains unknown. Use a larger independently labelled course sample and a held-out evaluation before changing production thresholds.

## Design decisions and verification

The board follows the source-card, group, and connection model described by [Obsidian Canvas](https://help.obsidian.md/plugins/canvas) and the [JSON Canvas specification](https://jsoncanvas.org/spec/1.0/), with optional whiteboard drawings. Excalidraw replaced React Flow because frames, freehand tools, sticky notes, and editor history fit this workflow. Its [embedding API](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/) provides custom reference rendering and scene changes; OghmaNotes supplies ownership, persistence, and live card content. This requires a stricter scene adapter than React Flow's direct React node model.

Excalidraw 0.18.1 has an [MIT license](https://github.com/excalidraw/excalidraw/blob/v0.18.1/LICENSE), as does [React Flow's core](https://github.com/xyflow/xyflow/blob/main/LICENSE). React Flow remains a simpler fit for a graph-only interface. The [tldraw SDK terms](https://tldraw.dev/community/license) require an appropriate production license and active key, adding a deployment dependency. These library and licensing facts were checked on 2026-10-03; recheck before changing libraries.

Bounded Postgres JSONB keeps topic catalogues, layouts, and question trees transactional with owned notes. Internal JSON references rely on application validation rather than topic foreign keys. A graph database would add a second ownership and consistency boundary. Normalize topics/associations if independent concurrent editing or cross-map reporting outgrows these bounds. [Postgres documents JSONB's row-lock and document-size trade-offs](https://www.postgresql.org/docs/current/datatype-json.html#JSON-DESIGN).

Jev fits decisions against reviewed definitions; the generative model fits new definitions and variable exam structure. Embeddings can retrieve candidates but cannot establish source claims or marks. Keep arithmetic in code, as [Jev's documented limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13) recommend. Use the [Decisions contract](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request), [classification calibration guide](https://openrouter.ai/docs/cookbook/evaluate-and-optimize/jev-classification), and [current model page](https://openrouter.ai/typesafe/jev-1.13) for provider limits and pricing rather than copying a price into this document. OpenRouter and TypeSafe have separate [logging](https://openrouter.ai/docs/guides/privacy/data-collection) and [retention policies](https://typesafe.ai/legal/privacy-policy); no endpoint-specific zero-retention claim is made here.

Focused tests exist under `src/__tests__/lib/study-map-*.test.ts` and [study-board-card.test.tsx](../../src/__tests__/components/study-board-card.test.tsx). They cover evidence, classification, generation, exam accounting, scene validation, and live cards. [Browser workflows](../../tests/e2e/full/study-map.spec.ts) exercise the editor against the app and worker. Database contracts also cover ownership, concurrent publication, source replacement with identical text, corrections, and exact marks evidence. Saving a paper review revokes an in-flight analysis so it cannot overwrite the review.

Verification on 2026-10-04:

- `npm run test:ci`: 1,999 application tests and 188 Canvas MCP package tests passed after the canvas replacement.
- Dedicated database integration: 110 tests passed, including 41 Study Map cases, using a separate queue prefix. The local run excluded `mobile-auth-redis.test.ts` because its guard requires the CI Redis port; CI retains that test.
- Nine browser workflows passed against the standalone app, database, and worker: topic approval and classification; saved and unsaved drawings; frames, connectors, conflict handling, card removal and source updates; PDF, PNG and SVG previews; desktop/mobile labels and filters; reviewed exam accounting. They check browser errors, direct card actions, and preservation of unsaved drawings during PDF loading. The SVG case uses the synthetic seed and skips outside that setup because the normal upload route rejects SVG files.
- Lint, locale audit, TypeScript, and production build passed. Browser login and SVG/PDF previews also passed through the private HTTPS origin. A separate check opened the existing two-page PDF viewer without errors or remote font requests.

The preview uses synthetic data and mock classification. Live Jev response compatibility and course-specific calibration still require the optional evaluation above. Production databases and the main branch were not changed by this verification.
