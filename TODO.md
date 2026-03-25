# OghmaNotes — Project TODO

> Last checked: 2026-03-19 (updated after test + RAG work)
> Stack: Next.js 16 · PostgreSQL + pgvector · S3/MinIO · Lexical · Zustand

---

## MVP (minimum viable submission)

- [x] User registration with validation + bcrypt
- [x] User login with JWT session cookies
- [x] Password reset flow (request + verify via email)
- [x] Rate limiting + account lockout on failed logins
- [x] Create / read / update / delete notes
- [x] Soft delete (trash) with 7-day recovery window
- [x] Restore and permanently delete from trash
- [x] Hierarchical file tree (folders + notes)
- [x] Drag-and-drop tree reordering via POST /api/tree
- [x] File upload to S3/MinIO with signed URL retrieval
- [x] PDF viewer, image viewer, video viewer in editor
- [x] VSCode-style 4-pane layout with resizable panes
- [x] Lexical rich-text editor with markdown support
- [x] Split-view editing (two notes side by side)
- [x] Search modal (Cmd+K) with debounced filtering
- [x] Note sharing — clone to another user (POST /api/notes/:id/share)
- [x] Settings page — account info, editor theme, language
- [x] Internationalisation — 12 locales (en, fr, de, es, ga, ar, hi, zh-CN, …)
- [x] Landing page with features, FAQ, contact form
- [x] Docker Compose for local PostgreSQL
- [x] Database migrations (006 consolidated UUID v7 schema)
- [x] **At least one passing test** — 66 tests passing across 5 test files
- [ ] Change password endpoint + settings UI wired up
- [ ] Delete account — endpoint + danger zone UI (currently `console.log` only)
- [ ] Log out other sessions endpoint
- [ ] Fix `1` artifact file in project root

---

## Full finished project

### Auth & accounts
- [x] Register, login, logout
- [x] JWT session management
- [x] Password reset via AWS SES email
- [x] Rate limiting + lockout
- [x] NextAuth v4 skeleton (Credentials + Google/GitHub/Azure/Apple providers declared)
- [ ] OAuth providers actually functional (Google, GitHub)
- [ ] Change password (POST /api/auth/change-password)
- [ ] Delete account (POST /api/auth/delete-account)
- [ ] Logout all sessions (POST /api/auth/logout-all)
- [ ] Avatar upload (currently console.log stub)
- [ ] Resolve dual-auth conflict: custom JWT lib/auth.js vs NextAuth coexisting

### Notes & editor
- [x] Create / read / update / delete notes
- [x] Soft delete + trash recovery
- [x] File tree with lazy-loaded children
- [x] Drag-and-drop reordering
- [x] Expand/collapse folders, persist in DB
- [x] Lexical rich-text editor
- [x] Markdown editor + source editor modes
- [x] Split-view (two panes)
- [x] PDF / image / video viewers
- [x] Command palette
- [x] Backlinks panel
- [x] Dictionary panel
- [x] Note cloning / sharing (POST /api/notes/:id/share)
- [ ] Public share page (/share/[id]) — archived, Phase 2 target
- [ ] Note export (markdown / PDF) — disabled "coming soon" in settings
- [ ] Note import — disabled "coming soon" in settings
- [ ] Offline sync (src/lib/notes/sync/ is empty)

### AI / RAG pipeline
- [x] PDF text extraction (pdf-parse via /api/extract)
- [x] Sentence-aware chunker (lib/chunking.ts)
- [x] Concurrent embedding requests (lib/embeddings.ts)
- [x] HNSW vector index on app.notes.embedding
- [x] **Store embeddings into DB** — /api/extract mean-pools chunks and writes to app.notes.embedding
- [ ] Semantic search endpoint (GET /api/search?q=...)
- [x] RAG query endpoint — POST /api/chat embeds query, pgvector search, calls LLM
- [x] Wire AI chat tab — /chat full-page + inline sidebar mini chat, both wired to /api/chat
- [ ] Note summarisation button (AI panel — currently "coming soon")
- [ ] Generate study prompts / questions button (AI panel — currently "coming soon")
- [ ] Find related notes button (AI panel — currently "coming soon")
- [ ] Document EMBEDDING_API_URL in .env.example / README

### Quiz & flashcards
- [ ] Flashcard data model + API (create, review, SRS scheduling)
- [ ] Quiz data model + API (generate from note content)
- [ ] Todo tab — replace hardcoded mock data with real due cards/quizzes
- [ ] Spaced repetition algorithm (SM-2 or similar)
- [ ] Quiz generation from AI (call LLM with note content)

### Canvas LMS integration
- [x] Store Canvas token + domain per user
- [x] List Canvas courses (GET /api/canvas/courses)
- [x] Import files from Canvas modules (POST /api/canvas/import)
- [x] Async import job queue (canvas_import_jobs table)
- [x] Check import job status (GET /api/canvas/status)
- [x] CanvasIntegration settings component
- [ ] End-to-end: imported PDF → extract → embed → store pipeline verified
- [ ] Import progress UI feedback (polling job status in frontend)
- [ ] Error handling + retry for failed import jobs

### Infrastructure & quality
- [x] Docker Compose (PostgreSQL + app)
- [x] Dockerfile
- [x] AWS Amplify deploy config (amplify.yml)
- [x] Database migrations (006, 007, 008)
- [x] **Tests — unit** (66 tests: chunking, validation, auth JWT, embeddings, notes API)
- [ ] **Tests — integration** (API route tests)
- [ ] **Tests — e2e** (Playwright or similar)
- [ ] .env.example with all required variables documented
- [ ] Consolidate JS/TS split in API routes to consistent TypeScript
- [ ] Update docs/DATABASE_SCHEMA.md to match actual migration 006 schema
- [ ] Remove accidental `1` file from project root
- [ ] i18n — audit all remaining untranslated keys (I18N_AUDIT files in root)

---

## Progress summary

| Area                  | Done | Total | %    |
|-----------------------|------|-------|------|
| Auth & accounts       | 5    | 11    | 45%  |
| Notes & editor        | 13   | 15    | 87%  |
| AI / RAG pipeline     | 6    | 11    | 55%  |
| Quiz & flashcards     | 0    | 5     | 0%   |
| Canvas LMS            | 6    | 9     | 67%  |
| Infrastructure/quality| 6    | 11    | 55%  |
| **MVP blockers**      | 20   | 23    | 87%  |
| **Total**             | 38   | 62    | ~61% |

Core editing, auth, and RAG pipeline are solid. 66 tests passing. Full-page /chat and inline sidebar mini-chat are wired to the real /api/chat RAG endpoint (embed query → pgvector cosine search → LLM). Requires LLM_API_URL + LLM_API_KEY env vars to generate answers; gracefully degrades to returning matched note titles if LLM is not configured. Still needed: flashcard/quiz data model, semantic search standalone endpoint, AI panel action buttons.
