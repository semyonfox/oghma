# OghmaNotes Project Report (Merged, Structured)

Date: 2026-03-30
Prepared for review/scrutiny

This document merges:

- `/home/semyon/Downloads/project-report-condensed.md`
- user-provided Perplexity addendum (project history and architecture rationale)
- local AI telemetry analysis performed during this audit session

## 1) Scope and Method

This report combines three evidence types:

1. **Git history evidence** from the current repository clone (`git log` analysis)
2. **Condensed historical summary** (weekly breakdown and key conversation excerpts)
3. **Local AI conversation telemetry** (Claude/OpenCode/Codex storage + tool usage patterns)

Where sources disagree, disagreements are called out explicitly.

## 2) Project Origin and Evolution

- **Verified from git history**:
  - first commit is `31a2e5a2` on 2025-09-11
  - rename milestone exists as `5e1c61d8` on 2026-02-24 (`refactor: rename project from socsboard to oghma throughout all documentation and code`)
- **Reported in external sources (not independently proven from git alone)**:
  - CT216 group-project context at NUIG
  - conceptual product pivot from Socsboard to OghmaNotes before/around rename

## 3) Timeline (Verified + Merged)

### 3.1 Verified timeline from current git clone

- First commit in current history: **2025-09-11** (`31a2e5a2` Initial commit)
- Latest commit in current history at audit time: **2026-03-30** (`e607c93f`)
- Total commits visible in current clone: **752**

Monthly commit volume (current clone):

- 2025-09: 4
- 2025-10: 6
- 2025-11: 44
- 2025-12: 24
- 2026-02: 216
- 2026-03: 458

### 3.2 Condensed report timeline context (external file)

The condensed report header states:

- `2025-09-11 to 2026-03-25 | 849 commits | 456 unique | 260 key conversations`

### 3.3 Reconciliation note

- The commit total is **not identical** between sources (**752** on `HEAD` in current clone vs **849** in condensed report).
- Current clone also shows **990 commits across all refs** (`git rev-list --count --all`).
- Likely causes: different snapshot times, branch inclusion differences, merge/rewrite differences, or counting methodology.
- For formal grading/review, use a single reproducible command set and lock the exact ref range.

## 4) Milestone Timeline (High Confidence)

Key milestones from commit history, cross-checked against condensed timeline where possible:

### Sep-Nov 2025 (foundation/auth/docs)

- Initial setup and early prototype work
- Auth and registration flows begin
- Docker deployment support introduced (`a4082442`)

### Dec 2025-Jan 2026 (stabilization + UI prep)

- Dependency and env hygiene cycles
- Early Tailwind/template work
- Documentation consolidation and project structure cleanup
- Note: current `HEAD` history has no January commits; January activity appears when counting all refs and in condensed report

### Feb 2026 (acceleration)

- Notea/editor extraction and integration (`ec348d28`)
- S3 storage/provider foundation (`2201e26e`)
- VSCode-style split-pane redesign (`40fe7cfe`)
- Rename from Socsboard to Oghma (`5e1c61d8`)

### Mar 2026 (platform hardening + feature depth)

- UUID v7 migration and follow-up fixes (`a90f7c4d`, `4f9ba7b8`, `d4bb4550`)
- Tree and editor behavior fixes; drag/drop and pane UX improvements
- Canvas ingestion groundwork and integration merges (`c2c78e9b`)
- RAG pipeline integration and iterative reranker/embedding changes
- Observability, secrets-related fixes, OAuth and session handling improvements
- Ongoing import/worker/pipeline reliability fixes through late March

## 5) Architecture and Decision Rationale (Evidence-Tagged)

From combined sources (repo evidence + user-provided addendum):

- **Verified from commits**: frontend moved toward Next.js + Tailwind + Notea/Lexical editor integration
- **Verified from commits**: strong emphasis on file tree UX, split panes, metadata/AI side panels
- **Verified from commits**: storage/ingestion and queue/worker iterations were active in Mar 2026
- **Verified from commits**: RAG pipeline and embedding/rerank/provider iterations occurred in Mar 2026
- **Verified from commits**: Canvas LMS ingestion became a major workstream
- **Verified from commits**: security/deploy hardening activity increased in late-stage cycles

### Decision themes repeatedly visible in commits/conversations

- minimize friction for deployment (Amplify-centric flow)
- prioritize product feel (Obsidian/VSCode-like UX goals)
- iterative migration rather than full rewrites where possible
- practical tradeoffs under time pressure (ship, then harden)

## 6) Conflict and Uncertainty Register

Items explicitly requiring review confirmation:

1. **Commit totals discrepancy** (752 vs 849)
2. **DB stack wording conflict** in addendum:
   - claim about MariaDB-vs-Postgres rationale may not match current repo reality
3. **Exact pivot date** from Socsboard to OghmaNotes:
   - commit evidence confirms rename milestone in Feb 2026, but conceptual pivot likely started earlier

## 7) AI-Assisted Development Audit (Local Evidence)

Metrics below are point-in-time and can drift as new sessions are written.

### Claude Code

- session files parsed: 5,293
- user messages: 17,148
- assistant messages: 26,775
- top tools: `Bash`, `Read`, `Edit`, `Skill`, `Grep`

### OpenCode

- session files parsed: 80
- user messages: 525
- assistant messages: 4,442
- dominant mode: `build`
- sessions with file-change summaries: 36
- summarized change volume: 1,476 files, 92,218 additions, 28,328 deletions

### Codex

- session files parsed: 4
- user messages: 11
- assistant messages: 17
- dominant tool: `exec_command`

### Gemini / Antigravity

- no clear local transcript stores identified in scanned paths
- only config/runtime/plugin artifacts found

Verification detail:

- gemini conversation-like files found by strict scan: `0`
- antigravity conversation-like files found by strict scan: `0`

## 8) Request Types and Actions (What was asked, what got done)

Frequent request categories across parsed data:

- debugging/fixes
- git workflow and branch hygiene
- infra/build/deploy troubleshooting
- UI/UX refinement (pane layout, editor behavior, sidebars)
- docs/summaries/plans
- automation via task/subagent flows

Frequent action types performed by assistants:

- direct code edits and refactors
- shell-driven verification and debugging
- migration/config updates
- documentation rewrites/condensing
- issue triage and implementation planning

## 9) Risk Snapshot (for final review)

Before final submission/release review, verify:

- exact architecture truth (DB/vector/auth/deploy statements)
- secrets handling posture in deployment environment
- test coverage claims vs actual instrumentation/results
- Canvas/RAG import reliability under real load
- branch/status consistency (`dev`, `main`, deployment targets)

## 10) Review Checklist (for scrutiny session)

Use this as a live review script:

1. Lock commit range and recount totals from one canonical branch/ref
2. Confirm pivot narrative dates with concrete commits/PRs
3. Verify stack claims against `package.json`, infra configs, and active code paths
4. Confirm security claims with current environment + pipeline settings
5. Validate key functionality end-to-end: auth, notes/tree, PDF, Canvas import, RAG search/chat
6. Reconcile any remaining contradictions and update this document as source-of-truth

## Appendix A: Provenance

- condensed source: `/home/semyon/Downloads/project-report-condensed.md`
- merged report target: `docs/project-report-merged-2026-03-30.md`

## Appendix B: Verification Commands and Outputs

Git verification:

- `git rev-list --count HEAD` -> `752`
- `git rev-list --count --all` -> `990`
- `git log --reverse --format='%H|%ad|%s' --date=short` first/last:
  - `31a2e5a2...|2025-09-11|Initial commit`
  - `e607c93f...|2026-03-30|chore: clean up frontend component updates and report docs`
- `git show -s --format='%H|%ad|%s' --date=short 5e1c61d8` -> rename commit confirmed on `2026-02-24`

AI telemetry verification:

- re-parsed local stores for Claude/OpenCode/Codex counts
- strict Gemini/Antigravity transcript-like scan returned zero conversation-history artifacts

Status model used in this document:

- **Verified**: supported directly by current git/local telemetry outputs
- **Reported**: from condensed/addendum text, not independently proven from current git alone

## Appendix C: Claim Verification Matrix (Code/Config Evidence)

| Claim                                                                                            | Evidence checked                                                                                                                                                            | Verdict                          |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| App uses Next.js                                                                                 | `package.json` (`next` dependency, `next dev/build/start` scripts), `README.md` tech stack                                                                                  | **Verified**                     |
| App uses Tailwind                                                                                | `package.json` (`tailwindcss`, `@tailwindcss/postcss`), class-heavy UI components under `src/components`                                                                    | **Verified**                     |
| Editor stack includes Lexical                                                                    | `package.json` (`@lexical/*`, `lexical`), `src/components/editor/lexical-editor.tsx`                                                                                        | **Verified**                     |
| Project is based on Notea scaffold                                                               | `README.md` credits, multiple `// extracted from Notea` headers in `src/lib/notes/*` and `src/components/*`                                                                 | **Verified**                     |
| Split-pane editor exists and second pane is optional                                             | `src/components/editor/split-editor-pane.tsx` (single pane default, split only when pane B is active)                                                                       | **Verified**                     |
| Right sidebar is collapsible and contains Meta/Tags/AI/Tasks tabs                                | `src/components/layout/vscode-layout.tsx`, `src/components/panels/notes-inspector-sidebar.tsx`                                                                              | **Verified**                     |
| Canvas integration is a major subsystem                                                          | Canvas UI + hooks + API + worker files (`src/components/settings/canvas-integration.jsx`, `src/hooks/useCanvasImportStatus.js`, `src/lib/canvas/*`, `src/app/api/canvas/*`) | **Verified**                     |
| Worker/queue architecture is used for imports                                                    | `src/lib/canvas/worker-entry.js` (SQS polling + ECS scale-down + DB safety-net), queue URLs in `amplify.yml`                                                                | **Verified**                     |
| Vault import runs OCR/chunking/embeddings pipeline                                               | `src/lib/vault/import-worker.js` (`extractWithMarker`, `chunkText`, `embedChunks`, writes chunks/embeddings)                                                                | **Verified**                     |
| RAG search uses vector similarity in Postgres                                                    | `src/lib/rag.ts`, `src/app/api/chat/route.ts` (`<=>` vector distance SQL against `app.embeddings`)                                                                          | **Verified**                     |
| Cohere is used for embeddings and reranking (current state)                                      | `src/lib/embeddings.ts` (Cohere v2 embed), `src/lib/rerank.ts` (Cohere rerank)                                                                                              | **Verified**                     |
| Deployment path is Amplify-centric                                                               | `amplify.yml` exists with full build/runtime env + SSR build handling                                                                                                       | **Verified**                     |
| Security hardening present in app config                                                         | `next.config.mjs` security headers (CSP, HSTS, X-Frame-Options, etc.)                                                                                                       | **Verified (limited)**           |
| Auth.js/NextAuth OAuth + credentials integration exists                                          | `src/auth.config.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `next-auth` dependency                                                                                     | **Verified**                     |
| Structured data stack is MariaDB RDS                                                             | Current code/config references Postgres (`postgres` client, `DATABASE_URL` postgres URLs, `vector` casts, pgvector docker image)                                            | **Conflicted by evidence**       |
| Exact pivot date from Socsboard to OghmaNotes is known                                           | Rename commit is known (`5e1c61d8`), but conceptual pivot date not singularly provable from code/config alone                                                               | **Partially verified**           |
| Team composition and role details (NUIG context, member count/roles) are fully evidenced in repo | `README.md` has names; detailed role narrative mostly from external text/addendum                                                                                           | **Reported, not fully verified** |
| Historical test coverage claim (~4-15%) is evidenced in repo artifacts                           | No canonical coverage report or locked CI trend was included in this verification pass                                                                                      | **Unverified**                   |

Notes:

- This matrix verifies technical claims against the present repository snapshot, not every historical runtime state.
- Any claim marked **Reported** or **Unverified** should be treated as narrative until backed by a concrete artifact (CI report, issue, PR, commit, or infra export).
