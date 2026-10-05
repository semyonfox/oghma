# Study maps

> **Status:** Implemented on the feature branch; release verification tracked below
> **Last reviewed:** 2026-10-05
> **Source of truth for:** Study Map persistence, classification, evidence, and exam-history contracts

Study maps organise existing notes and files around reviewed module topics. The canvas is a view of those records. Topic membership, card placement, and labelled links are separate. Exam history describes reviewed uploaded papers; it does not measure student mastery or predict the next exam.

## Using a map

1. Open `/study-map`. Each imported Canvas course with no map gets one automatically ([setup.ts](../../src/lib/study-map/setup.ts)): named after the course folder, using its academic year, folder and Canvas course ID. Courses marked inactive in course settings are skipped. Deleting a course map records the course in `study_map_dismissed_courses` so it is not recreated. **Add module** creates a map from a name and folder for material outside Canvas.
2. For a Canvas course, setup writes a `CT230 course outline` note into the course folder from free sources and makes it the syllabus ([descriptor.ts](../../src/lib/study-map/descriptor.ts)): the public [Galway module descriptor](https://www.universityofgalway.ie/course-information/module/CT230) for Galway accounts (description, content, learning outcomes, assessment split; module code from the folder title), the Canvas `syllabus_body` and home page fetched with the student's own token, and the imported Canvas module folder names. Galway's empty-course template home page is ignored. Without an outline, a syllabus is picked by title (`syllabus`, `module outline`, `course descriptor` and similar; see [syllabus.ts](../../src/lib/study-map/syllabus.ts)). A syllabus is optional.

   On one student's 18 Galway courses (2026-10-05), 10 had a `syllabus_body`, 16 a non-empty home page, and most named their Canvas modules after teaching units ("Normalisation", "Topic 4. Probability"). Canvas outcomes and pages were unused. About three quarters of public descriptors list learning outcomes.
3. Topics are proposed once per map, after any Canvas import finishes, aiming for 5–12 topics that match the teaching units. A syllabus of at least 1,500 characters is used alone; a shorter one is joined by the opening of every other material (up to 60, within an 80,000-character budget), and without a syllabus the materials alone are used. On five real courses an outline alone gave 7–11 topics matching their Canvas modules, and on CT230 Jev then placed 12 of 12 real lectures and problem sheets correctly. New proposed topics are approved straight away, since each definition must quote its sources exactly; a misquoted citation is dropped, and a topic left with none is dropped. A changed definition of an existing topic still needs review. Topics can be edited, unapproved or added by hand under **Topics**, and **Find topics again** reruns the proposal.
4. Once topics exist, materials are classified in the background. Review core/supporting suggestions in the inspector and save corrections. Document kind and labels remain editable.
5. Open **Map** to see the module as a course flow: weeks run left to right, topics top to bottom, and each note sits in its week between the topics it covers. Hover a card to preview it, open it in the reader, follow a topic through the course, or switch to **All modules** to see every module and the links between them. Moving or pinning a card changes its layout only. Its topic assignments remain in the inspector.
6. In **Exam history**, analyse a past paper, check its year, sitting, syllabus version, questions, marks, topic assignments, and section rules, then approve the review. Resolve source or taxonomy changes before using its statistics again.

New maps have `auto_classify` on, shown as **Keep this module organised automatically** in module settings. For those maps, `autoConfigureStudyMap` in [jobs.ts](../../src/lib/study-map/jobs.ts) syncs sources, picks a syllabus, queues one topic proposal and classifies new or changed materials. It runs when a map is created or its settings change, when `/study-map` creates course maps, and every 60 seconds in the worker. After a topic proposal is published, classification is queued straight away. With a live provider these calls can cost money: one topic proposal per map, plus one classification per new or changed material. A failed or empty proposal is not retried automatically. Paper analysis still has to be started by hand. Maps with the setting off keep the manual **Sync sources** and **Classify materials** buttons. Saved corrections survive reruns.

## Persistence and ownership

[Migration 071](../../database/migrations/071_study_maps.sql) adds four tables. [Migration 076](../../database/migrations/076_study_map_dismissed_courses.sql) adds `study_map_dismissed_courses`, the Canvas courses whose automatic map was deleted. [Migration 077](../../database/migrations/077_study_analysis_cache.sql) adds the shared caches described under [Cost and caching](#cost-and-caching). Its presence does not prove it has run in a particular environment.

| Table             | Owns                                                                                                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `study_maps`      | Module identity, source selection, bounded topic catalogue, taxonomy version, map revision, board revision, course-map layout (manual positions, pins, week overrides, labelled links), automatic-classification opt-in |
| `study_materials` | Membership and exclusions, document kind, labels, suggested associations, raw classification result, source hash, taxonomy version, separate manual overrides                                |
| `study_papers`    | Source hash, taxonomy version, reviewed flag, structured questions and section choices                                                                                                       |
| `study_jobs`      | Durable pending/running/completed/failed work, attempts, lease expiry and token                                                                                                              |

Composite foreign keys bind maps, materials, papers, jobs, and extraction relationships to the same owner. Queries additionally require active, visible notes and omit import-cache sources. Removing a material excludes it from the map and invalidates active jobs; deleting the map cascades its records while preserving library notes.

`types.ts` supplies Zod contracts. `mutations.ts` validates topic IDs, unique names, parent cycles, source anchors, board endpoints, and submitted versions under transactions. Map edits use `version`; board saves use `boardVersion`. A conflicting edit returns 409 instead of overwriting newer work.

Layout changes save automatically about 0.7 seconds after the last edit, with the board revision they started from, and are flushed with `keepalive` when the page closes. A refreshed snapshot replaces the local board only when nothing local is waiting to save. A newer server revision returns 409; the map then shows the conflict and offers **Use the latest** or **Keep mine**, which saves the local layout over the newer revision. The camera position is kept per module in `sessionStorage` so returning from a note restores the view.

Topic meaning changes increment `taxonomyVersion` and stale prior results. The comparison includes IDs, definitions, inclusion/exclusion criteria, aliases, and approval state. Names and parent placement are presentation changes in this comparison. The worker rechecks source, map, taxonomy, membership, and lease before publishing. Snapshot reads calculate staleness against current source text; study search excludes stale topic and label associations.

Changing, deleting, hiding, or oversizing a cited syllabus source also invalidates the affected topic's effective approval, even before the catalogue is edited. Snapshots retain the definition for review, paper review becomes ineligible, and search omits associations to that topic. Classification and paper jobs validate approved topic anchors at enqueue, input loading, and publication; stale evidence blocks processing until reviewed. Saving material or paper reviews also validates current topic evidence.

Manual overrides are stored separately with the reviewed source hash and taxonomy version. Reruns update automatic results without replacing overrides. Changed sources or topic meaning leave those corrections visible for review, but their topic decisions no longer apply until reviewed again.

## Course map

[study-flow.tsx](../../src/components/study-map/study-flow.tsx) renders the map with ordinary HTML cards and an SVG layer for ribbons and links, under one CSS transform for pan and zoom. There is no drawing editor or scene format. Cards only hold references; [study-board-card.tsx](../../src/components/study-map/study-board-card.tsx) resolves the current title, excerpt, topics and review state from the snapshot, and loads image and first-page PDF previews only while visible.

[flow.ts](../../src/lib/study-map/flow.ts) computes the layout as pure functions:

- **Weeks.** An explicit week in the title (`Week 3`, `W03`) wins, then one in the parent folder, then a lecture, lab or session number, then a leading number. Imported Canvas modules usually arrive as week folders. Notes with no signal sit in a **No week** column. A week set on the card overrides inference, including an explicit no-week choice.
- **Topics.** Rows keep the syllabus hierarchy and order siblings so that topics sharing material sit next to each other.
- **Placement.** A card's height is the weighted middle of its topic rows: core counts fully, supporting less, unreviewed suggestions less again. Cards in one week never overlap. Rejected associations do not place a card; unclassified material sits in a bottom row.
- **Grouping.** Syllabus and past-paper materials stay in topics and Exam history rather than the weekly flow. Extracted Markdown is read through its original file rather than shown as a second card.
- **Links.** Stored note references (`note_links` and attachments) appear as "links to" across every loaded module; labelled links drawn on the map are saved per module. Topics in different modules are bridged when they share a name or alias, or when their notes link to each other.
- **Assignments.** Assignment rows come from `app.assignments` for the map's Canvas course. Their briefs are not classified; a topic counts when its name or an alias appears in the title or brief. Each assignment draws on its imported files first, then notes covering the topics it names, and sits after the latest week of that material because no teaching calendar is stored.

Following a topic numbers its core notes in week order, dims unrelated cards, and lists supporting material, co-occurring topics and related topics in other modules, with the reviewed-paper frequency from Exam history. The reader opens notes, PDFs and images beside the map; **Open in editor** goes to the existing note view.

Mouse users drag cards directly; on touch a card moves only once selected, so one finger otherwise pans. Ctrl or Cmd with the wheel, or a pinch, zooms. Tab follows modules, weeks and height; Enter reads a card, Space previews it, Shift with an arrow key moves it, and P pins it. Below 42% zoom cards show only titles, and below 24% they become coloured blocks. Above 260 cards, offscreen cards are not rendered.

The board JSONB keeps `layout: 2`, manual positions relative to the module frame, pins, week overrides and labelled links. `mutations.ts` rejects positions, weeks or links that refer to anything other than this map's active materials, its topics, or assignments for its Canvas course. Boards saved by the earlier drawing editor read as a fresh layout that keeps their note-to-note links, so no migration is needed.

## Evidence and extraction

`evidence.ts` hashes the exact source field and text together. Anchors hold the canonical note ID, `content` or `extracted_text`, SHA-256 hash, JavaScript string offsets, exact quote, line, and optional page. Repeated text keeps separate occurrences. Anchor validation checks the hash, substring, and location. RAG chunk IDs are never evidence identities.

Markdown and text use `notes.content`. Binary files use `extracted_text`, unless an active owned Markdown note explicitly points to the original through `extracted_from_note_id`; that Markdown content becomes the preferred analysis source. Import paths record this relationship and the inspector exposes linked file/note references. Filenames alone do not establish a pair. Page numbers require explicit page markers in the extracted text, so an anchor can have a line without a reliable PDF page.

Original-file and extraction views select the same canonical text for source hashes, evidence, and search. Editing the linked Markdown makes prior results stale in either view. Access checks apply to both records; a missing or inaccessible extraction falls back to the original's extracted text. Attachments and embedded references remain owned library records.

Sources above 320,000 characters or 250 passages fail with a split-material message. Classification splits at headings and paragraph boundaries, merges short neighbours, then bounds requests to 24 questions, three passages, and 20,000 encoded bytes. Generation has a separate 100,000-character context limit; topic proposals deliberately show later materials as openings, and every quote is still checked against the full text. Maps support 80 topics and 500 materials; one user can have 100 maps. These are implementation limits, not provider guarantees.

## Cost and caching

Like the [imported file cache](../../src/lib/canvas/import-cache.ts), study results are content-addressed and shared across users ([cache.ts](../../src/lib/study-map/cache.ts)):

- `study_decision_cache` holds one Jev answer per SHA-256 of model, prompt version, question criteria, topic meaning and exact passage text. Topic IDs are left out, so a classmate's copy of the same file with the same topic definitions costs nothing, and editing one topic re-asks only that topic's questions. Mock answers are never stored.
- `study_generation_cache` holds one topic proposal per SHA-256 of model and prompt, so identical course material with no existing topics is proposed once.
- `module_descriptors` holds each public descriptor for 30 days, including modules without a usable page. Canvas syllabus and home pages are fetched once per map, when its outline is written.

Bump `PROMPT_VERSION` in [classification.ts](../../src/lib/study-map/classification.ts) when questions, criteria or passage splitting change, so old answers stop matching.

Jev bills each request's passages once plus roughly 50 tokens per question, so cost follows the number of questions. Extracted slide text splits at every blank line into ~200-character fragments; classification merges neighbouring fragments into passages of at least 1,200 characters (`splitSourcePassages(source, 1_600, 1_200)`) and asks the document kind on the opening passage only. On 12 real CT230 lectures and problem sheets this cut a cold run from $0.057 to $0.013 with the same 12/12 placements, and a repeat over identical files cost nothing (2026-10-05, `typesafe/jev-1.13`).

Topic proposals and paper extraction run with low reasoning even when chat runs with it off. With reasoning off, `openai/gpt-6-luna` drafted inside its JSON answer and restarted it, failing about half of proposals; scope fields returned as lists are joined into text, and quoted sources are referred to as `S1`, `S2` because the model garbled note UUIDs once there were many sources.

## Providers and worker

`config.ts` selects `STUDY_CLASSIFIER_PROVIDER=mock|jev|generative`, defaulting to `jev`. Jev credentials resolve from `JEV_API_KEY`, then `OPENROUTER_API_KEY`, then `LLM_API_KEY` only when the configured LLM URL is OpenRouter. Topic proposals and paper extraction use the existing LLM configuration through `createLlmProvider` and `getLlmModel`; a Jev key alone does not enable generation.

`classification.ts` asks an independent `CORE`, `SUPPORTING`, or `UNRELATED` Choice for each passage/topic pair, plus document-kind Choice and label Nouls. Several topics can apply. Jev responses preserve model IDs, raw decisions, probabilities, optional confidence, token usage, and nullable cost. Generative classification returns categorical decisions with no invented probability or confidence. Results remain suggestions. The current relevance and label thresholds, 0.6 and 0.65, are provisional and have not established course-specific accuracy.

`jobs.ts` runs provider calls outside publish transactions. The existing import worker polls study jobs every five seconds and reconciles opted-in maps every 60 seconds, catching imported or changed materials, a newly matching syllabus and a missing first topic proposal without making source saves wait for classification. Claims use `FOR UPDATE SKIP LOCKED`, a five-minute lease, and a 30-second heartbeat. Expired claims return to pending until three attempts, then fail for manual retry. One enqueue is capped at 50 jobs, with 100 active jobs per user. Automatic reconciliation skips a material whose latest job failed.

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

`seed-study-map.ts` requires the dedicated loopback database and storage ports above, mock classification, and the synthetic reset user. It creates Operating Systems and Database Systems maps for 2025/26, each with six reviewed topics and a synthetic Canvas course ID. Notes sit in `Week N` folders as an import would place them, and lecture material is marked as imported. Operating Systems includes 12 lecture notes, two of the student's own notes, a linked PDF/Markdown lecture pair, an SVG diagram and embedded reference, note links, two assignments (one with attached starter notes), reviewed and suggested associations, a note edited after review, and one labelled link on the map. Its four papers include two compatible reviewed summer papers, one awaiting review, and one reviewed paper from an older syllabus. Database Systems supplies four notes, an assignment, and a note that links to Operating Systems. Reruns preserve completed maps and resume unfinished ones; the seed itself does not reset the database.

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

The optional live command uses the configured Jev credential from the environment, including the existing chat credential when its endpoint is OpenRouter. It can spend money and is not part of setup or the mock run. A separate Jev key is optional.

```sh
npm exec --no -- tsx scripts/dev/evaluate-study-classifier.ts --provider jev --allow-paid --max-calls 12 --report /tmp/study-classifier-jev.json
```

`--max-calls` accepts 1–20 and caps HTTP attempts, including retries. Each case has 11 questions; input is guarded at 15,000 bytes per request. A 12-attempt run can finish fewer than 12 cases if retries occur. This is not a dollar cap, failed requests may incur charges, and missing usage remains unknown. Use a larger independently labelled course sample and a held-out evaluation before changing production thresholds.

The live evaluation on 2026-10-04 reused the configured OpenRouter chat credential in place, with authorization for a $0.10 budget. All 12 synthetic cases completed in 12 HTTP attempts, without retries or request errors. The returned model was `typesafe/jev-1.13-20260917`; reported usage was 37,725 input tokens and $0.00158445. No new key was created, no personal material was sent, and no application configuration or live database was changed.

Topic relevance matched the expected categories in 47 of 48 comparisons: 12 relevant pairs were detected, with one additional supporting-topic suggestion and no missed relevant pairs. The extra suggestion linked the call-stack prerequisite to graph traversal. Two expected content labels were missed: `code` for the factorial explanation and `worked example` for string concatenation. This verifies live response compatibility on these fixtures; it does not establish course-specific accuracy or justify changing the provisional thresholds.

## Design decisions and verification

The map borrows source cards, links and direct interaction from [Obsidian Canvas](https://obsidian.md/help/plugins/canvas), but its structure comes from the data: weeks, syllabus topics, classification and note references. An embedded Excalidraw editor was tried and removed. Its drawing tools, style panels and scene format suited a whiteboard rather than a map of existing notes, and it needed asset staging and a font patch. The custom renderer is a few hundred lines of pointer, wheel and transform handling over React components, with no new dependency. [React Flow](https://reactflow.dev/learn/troubleshooting/remove-attribution) would supply panning and edges, but it shows an attribution unless there is a Pro subscription, and its node model adds little when positions come from the layout function. Recheck these facts before adding a canvas library.

Bounded Postgres JSONB keeps topic catalogues, layouts, and question trees transactional with owned notes. Internal JSON references rely on application validation rather than topic foreign keys. A graph database would add a second ownership and consistency boundary. Normalize topics/associations if independent concurrent editing or cross-map reporting outgrows these bounds. [Postgres documents JSONB's row-lock and document-size trade-offs](https://www.postgresql.org/docs/current/datatype-json.html#JSON-DESIGN).

Jev fits decisions against reviewed definitions; the generative model fits new definitions and variable exam structure. Embeddings can retrieve candidates but cannot establish source claims or marks. Keep arithmetic in code, as [Jev's documented limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13) recommend. Use the [Decisions contract](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request), [classification calibration guide](https://openrouter.ai/docs/cookbook/evaluate-and-optimize/jev-classification), and [current model page](https://openrouter.ai/typesafe/jev-1.13) for provider limits and pricing rather than copying a price into this document. OpenRouter and TypeSafe have separate [logging](https://openrouter.ai/docs/guides/privacy/data-collection) and [retention policies](https://typesafe.ai/legal/privacy-policy); no endpoint-specific zero-retention claim is made here.

Focused tests exist under `src/__tests__/lib/study-map-*.test.ts` and [study-board-card.test.tsx](../../src/__tests__/components/study-board-card.test.tsx). They cover evidence, classification, generation, exam accounting, week inference, topic ordering, placement, trails, relations, and live cards. [Browser workflows](../../tests/e2e/full/study-map.spec.ts) exercise the map against the app and worker. Database contracts also cover ownership, concurrent publication, source replacement with identical text, corrections, and exact marks evidence. Saving a paper review revokes an in-flight analysis so it cannot overwrite the review.

Verification of the course map on 2026-10-04:

- `npm run test:ci`: 1,977 application tests and 188 Canvas MCP package tests passed. The application count fell from 1,999 because the drawing-scene tests were removed with the editor.
- Study Map database integration: 42 tests passed against the dedicated database, including board versions, rejected cards, weeks and links, pruning, earlier boards, and assignment ownership and course scope. The other integration suites were not rerun for this change.
- Nine browser workflows passed against the standalone app, database and worker: topic approval and classification; week and topic placement, hover previews, autosaved moves, pins and Tidy layout; topic trails and the reader; note links, labelled links, week overrides, conflicts and All modules; removal and source edits; PDF and image previews; the seeded module's assignments, extracted PDF and SVG; desktop/mobile labels and filters; reviewed exam accounting. The run used `http://localhost:3311`, because the production build's Secure session cookie is not sent to `127.0.0.1` by Playwright's request client.
- ESLint, the locale audit, both TypeScript checks and the production build passed. Phone-width and dark-theme views were checked by hand with no page overflow or console errors.

The preview uses synthetic data and mock classification. Live Jev response compatibility was checked separately by the synthetic evaluation above; course-specific calibration remains unverified. Production databases and the main branch were not changed by this verification.
