# OghmaNotes — CT216 Project Report: Master Plan & Knowledge Base

> **Module:** CT216 Software Engineering I
> **Team:** Semyon Fox (Tech Lead / Full-Stack / DevOps), Samuel Regan (Auth / RAG Pipeline)
> **Project Period:** September 2025 – March 2026
> **849 commits | 55 AI-assisted sessions | 58 active dev days**

---

## 1. What the Report Needs (Based on RMS & TDS Samples)

Both sample reports share a consistent skeleton that likely reflects the CT216 marking scheme. Your report should hit every one of these, but you can differentiate by going deeper on architecture rationale and being honest about AI-assisted development.

### Mandatory Sections (inferred from samples)

| Section | RMS Coverage | TDS Coverage | Your Angle |
|---------|-------------|-------------|------------|
| **Project Overview** | 1 page, general description | 1 page, motivation + gap analysis | Emphasise the *problem*: students drown in unstructured lecture PDFs, no tool unifies notes + AI-powered search. Gap: existing tools (Notion, Obsidian) lack RAG and Canvas LMS integration |
| **Team Roles** | Per-person narratives | Per-person role descriptions | Semyon: tech lead, architecture, DevOps, majority of features. Samuel: auth system (login/register/password-reset), RAG pipeline (chunking + embeddings initial impl) |
| **Feature Documentation** | Exhaustive per-feature with screenshots (desktop + mobile) | Briefer, demo walkthrough style | Take screenshots of every major view. You have more features than both samples combined |
| **Technical Architecture** | API docs, config architecture, service architecture | Modular backend description | This is where you dominate — microservice-like design, AWS infrastructure, RAG pipeline |
| **System Flows / Diagrams** | 6 flowcharts (auth, token refresh, ordering, menu, reservation, analytics) | Described in prose | Create flowcharts for: auth flow, Canvas import pipeline, RAG query flow, note CRUD lifecycle |
| **Database Design** | Full schema + ER diagram + relationships | Design diagram + rationale | PostgreSQL with pgvector — show migrations evolution, the `app.*` schema, vector storage |
| **CI/CD & DevOps** | GitHub Actions workflows documented | Minimal | AWS Amplify pipeline, ECS Fargate deployment, GitHub Actions |
| **Project Management** | Trello board screenshot | GitHub Projects kanban + Gantt | GitHub Projects/Issues — show the board |
| **Testing** | Not covered | Honest "we didn't have a framework" | You have some tests — document them. Be honest about coverage gaps |
| **Challenges / Problems** | Not covered | Per-person reflections | Critical section. Cover architectural pivots, AWS debugging, budget constraints |
| **AI Disclosure** | Not present | Not present | **Your differentiator.** Be transparent. 55 sessions, human-directed architecture, AI-executed code |
| **Resources & Links** | GitHub, live app, Figma, docs | GitHub, appendix | GitHub, oghmanotes.ie, architecture docs |

---

## 2. Project Facts & Figures (for the report)

### Tech Stack (Final State)

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Frontend** | Next.js 16 (App Router), React, TypeScript, Tailwind CSS v4 | VSCode-inspired split-pane editor UI |
| **Backend** | Next.js API Routes (serverless on Amplify) | REST API pattern with route handlers |
| **Database** | PostgreSQL 16 (AWS RDS) with pgvector extension | `app.*` schema, 22+ migrations |
| **Object Storage** | AWS S3 | Notes, attachments, Canvas-imported files |
| **Cache / Queue** | AWS ElastiCache (Valkey 8.2) | Session cache, BullMQ (later replaced by SQS) |
| **Job Queue** | AWS SQS | Canvas import jobs (migrated from BullMQ) |
| **Worker Runtime** | AWS ECS Fargate | Self-scaling Canvas import worker |
| **Email** | AWS SES | Transactional emails (password reset, notifications) |
| **CI/CD & Hosting** | AWS Amplify (Gen 2) | Build, deploy, CDN, SSR Lambda |
| **Auth** | Custom JWT + Auth.js (OAuth) | Email/password + Google/GitHub OAuth |
| **Embeddings** | Cohere embed-english-v3.0 (1024 dims) | Migrated from local Ollama qwen3-embedding (4096 dims) |
| **LLM** | Kimi K2.5 via Moonshot AI (planned) / Ollama Qwen3:8b (dev) | Dual-auth pattern: env var switches between providers |
| **OCR** | Marker API (Datalab) with pdf-parse fallback | For lecture PDF text extraction |
| **LMS Integration** | Canvas LMS REST API | Import courses, modules, files, assignments |
| **i18n** | 12 languages | Custom locale system with auto-translation |

### Key Metrics

- **849 total commits** across all branches
- **58 active development days** over 7 months
- **22+ database migrations** reflecting iterative schema evolution
- **55 AI-assisted development sessions** (Claude Code)
- **2 team members** (Semyon + Samuel)
- **Live at** oghmanotes.ie

---

## 3. Feature Inventory (for screenshots + documentation)

### Customer-Facing Features

1. **Landing Page** — marketing site with team bios, university logos, about page
2. **Authentication**
   - Email/password registration + login
   - OAuth (Google, GitHub) via Auth.js
   - Password reset via SES email
   - Rate limiting on auth endpoints
3. **Notes Editor (VSCode-style)**
   - Split-pane markdown editor with live preview
   - File tree sidebar (Obsidian-style with indent guides, compact rows)
   - Breadcrumb navigation
   - Command palette
   - File upload with drag-drop support
   - PDF viewer (in-app rendering)
   - Folder/file creation, rename, delete, duplicate
4. **Canvas LMS Integration**
   - Import courses, modules, files, assignments from university Canvas
   - Background processing via SQS + ECS Fargate
   - Real-time progress toasts
   - Course-organised file tree structure
5. **AI Chat (RAG-powered)**
   - Chat interface with session persistence
   - Context-aware: attach files/folders for scoped RAG queries
   - Powered by vector similarity search (pgvector + Cohere embeddings)
   - LLM response generation (Qwen3 / Kimi K2.5)
6. **Settings**
   - Profile management
   - Theme toggle (dark/light, class-based Tailwind v4)
   - Language selection (12 locales)
   - Canvas API token configuration
   - OAuth account linking/unlinking
7. **Internationalisation** — 12 languages with automated translation pipeline

### Backend / Infrastructure Features

1. **RAG Pipeline** — PDF → OCR/text extraction → chunking → Cohere embedding → pgvector storage → similarity search → LLM generation
2. **Canvas Import Worker** — SQS-triggered ECS Fargate container, self-scaling (polls → scales to 0 after idle), concurrent file processing
3. **Database Migrations** — 22+ SQL migrations showing iterative evolution
4. **Observability** — Error logging, structured API responses
5. **Security** — JWT auth middleware, rate limiting, input validation, SSL for RDS

---

## 4. Architectural Pivots & Design Decisions (Challenges Section)

These are your strongest material for the report. Each represents real engineering judgment.

### Pivot 1: Notea Fork → Custom Next.js App
- **What:** Started with Notea (open-source note app) as a base, ultimately stripped it down and rebuilt
- **Why:** Notea's architecture didn't support RAG, Canvas integration, or the AWS infrastructure needed
- **Evidence:** Feb 14 commits show `feat: add S3 storage provider and Phase 1 foundation`, `fix: move Notea components from apps/web/src to src`, `chore: remove obsolete apps/web directory`
- **Lesson:** Forking saves time initially but creates debt when the original architecture diverges from your needs

### Pivot 2: Monorepo → Single App
- **What:** Started as a monorepo (`apps/web/`), collapsed to single Next.js app
- **Why:** Amplify deployment complexity with monorepo structure, unnecessary abstraction for team of 2
- **Evidence:** Multiple `fix: configure amplify.yml for monorepo deployment` commits, then `feat: merge full functionality into apps/web with Tailwind`

### Pivot 3: BullMQ (Redis) → AWS SQS
- **What:** Canvas import job queue migrated from BullMQ to SQS
- **Why:** Amplify Lambda couldn't reach ElastiCache Valkey without VPC config. SQS is IAM-authenticated, no VPC needed
- **Evidence:** `feat: migrate Canvas import queue from BullMQ to SQS`
- **Lesson:** Cloud networking constraints drive architectural decisions more than theoretical best practices

### Pivot 4: Local Ollama → Cohere Embeddings
- **What:** Embedding model switched from self-hosted Ollama qwen3-embedding (4096 dims) to Cohere embed-english-v3.0 (1024 dims)
- **Why:** 4096 dims exceeded pgvector's HNSW index limit (2000 dims), forcing brute-force O(n) scans. Cohere at 1024 dims enables HNSW for O(log n) lookups
- **Evidence:** `feat: Cohere embeddings, rate limiting, i18n, OCR, and infra updates`
- **Lesson:** Embedding dimension choice has downstream performance implications that aren't obvious upfront

### Pivot 5: OpenWebUI Auth Layer → Direct LLM API
- **What:** Removed OpenWebUI as auth intermediary, switched to direct LLM API calls
- **Why:** Simplified architecture, reduced latency, enabled switching between providers via env vars
- **Evidence:** `feat: remove openwebui auth layer, persist chat sessions, i18n sidebar fixes`

### Pivot 6: pnpm → npm
- **What:** Package manager switch mid-project
- **Why:** Compatibility issues with Amplify build environment
- **Evidence:** Claude Code session: "we are using npm only here! add it to AGENTS.md for persistence"

### Budget Constraints
- **Context:** AWS education credits, ~€120 budget for final 17 days
- **Impact:** Self-scaling ECS pattern (worker scales to 0 when idle), careful resource selection
- **Lesson:** Real-world cost constraints shaped every infrastructure decision

---

## 5. AI Disclosure Section (Draft)

This should be its own section — neither sample report covers this, making it a differentiator.

### Suggested Content

> **AI-Assisted Development Disclosure**
>
> This project used Claude Code (Anthropic) as a development assistant throughout. Over 55 sessions and 549 user prompts, AI was used for code generation, refactoring, debugging, architectural discussions, infrastructure setup (AWS Amplify, RDS, ElastiCache, SQS, SES, S3), database schema design, and deployment automation.
>
> **How AI was used:**
> - The human developer (Semyon) directed all architectural decisions, feature priorities, and design choices
> - AI executed code changes under human review — generating implementations from high-level specifications
> - AI assisted with AWS CLI commands, debugging deployment issues, and infrastructure configuration
> - All AI-generated code was reviewed, tested, and modified before committing
>
> **What AI did NOT do:**
> - Make architectural decisions (e.g., the BullMQ → SQS migration was driven by a real networking constraint the developer encountered)
> - Replace understanding — the developer maintained full comprehension of the codebase
> - Write this report (though it may assist with formatting)
>
> **Reflection:**
> AI-assisted development significantly accelerated implementation velocity but introduced a tendency to overscope. The developer's self-identified weakness of overscoping was amplified by AI making ambitious features feel achievable in shorter timeframes. The key learning was that AI assistance shifts the bottleneck from "can I implement this?" to "should I implement this now?"

---

## 6. Database Design Section

### Schema Overview

The database uses PostgreSQL with the pgvector extension, organised under the `app` schema. Key tables:

| Table | Purpose |
|-------|---------|
| `app.users` | User accounts with auth credentials |
| `app.oauth_accounts` | Linked OAuth providers (Google, GitHub) |
| `app.notes` | Note/file metadata, S3 keys, parent references (tree structure) |
| `app.attachments` | File ownership records for S3 objects |
| `app.note_chunks` | RAG chunks with vector embeddings (pgvector) |
| `app.chat_sessions` | AI chat conversation threads |
| `app.chat_messages` | Individual chat messages within sessions |
| `app.canvas_tokens` | Encrypted Canvas LMS API tokens per user |
| `app.canvas_import_jobs` | Import job tracking (queued/running/complete/failed) |
| `app.canvas_imports` | Individual file import records within a job |

### Migration Evolution
- 22+ migrations from initial schema to current state
- Notable: `006_consolidated_safe_migration.sql` (major consolidation), `007_add_canvas_integration.sql`, `008_canvas_import_jobs_queue.sql`, `022_chat_uuid_v7.sql`
- Schema evolved iteratively — document this as evidence of agile development

### ER Diagram
Create a diagram showing relationships between: users → notes (1:many), users → chat_sessions (1:many), notes → note_chunks (1:many), notes → attachments (1:1), users → canvas_tokens (1:1), canvas_import_jobs → canvas_imports (1:many)

---

## 7. System Flow Diagrams Needed

Create these (use Mermaid, draw.io, or similar):

1. **Authentication Flow** — registration → email verification → login → JWT issuance → token refresh. Include OAuth branch (Auth.js → callback → account linking)
2. **Canvas Import Pipeline** — user triggers → API creates job in Postgres → SQS message → ECS Fargate worker spins up → downloads files from Canvas → uploads to S3 → OCR/text extraction → chunking → Cohere embedding → pgvector insert → self-scales to 0
3. **RAG Query Flow** — user sends chat message → query embedding (Cohere) → pgvector similarity search → top-k chunks retrieved → LLM prompt constructed with context → response streamed back
4. **Note CRUD Lifecycle** — create/edit in editor → API route → Postgres update → S3 storage (for files) → optional: trigger re-embedding for RAG

---

## 8. Report Structure (Recommended)

| # | Section | Approx Pages | Notes |
|---|---------|-------------|-------|
| 1 | **Cover Page** | 1 | Title, team names, student IDs, module, date |
| 2 | **Table of Contents** | 1 | Auto-generated |
| 3 | **Project Overview** | 1-2 | Problem statement, solution description, live link |
| 4 | **Team Roles & Contributions** | 1-2 | Per-person narrative (see section 9 below) |
| 5 | **AI Disclosure** | 1 | Transparent, reflective (see section 5 above) |
| 6 | **Customer-Facing Features** | 8-12 | Screenshots + descriptions for each feature area |
| 7 | **Technical Architecture** | 3-4 | System overview diagram, tech stack table, AWS infrastructure |
| 8 | **REST API** | 2-3 | Route structure, auth middleware, key endpoints |
| 9 | **Key System Flows** | 3-4 | Flowcharts for auth, Canvas import, RAG query |
| 10 | **Database Design** | 2-3 | Schema tables, ER diagram, migration history |
| 11 | **CI/CD & Deployment** | 1-2 | Amplify pipeline, ECS deployment, branch strategy |
| 12 | **Design Decisions & Pivots** | 2-3 | The 6 pivots documented above — strongest section |
| 13 | **Testing** | 1 | What exists, what doesn't, honest assessment |
| 14 | **Project Management** | 1-2 | GitHub Projects/Issues, timeline, methodology |
| 15 | **Challenges & Reflections** | 1-2 | Per-person reflections on problems encountered |
| 16 | **Future Work** | 0.5-1 | Kimi K2.5 migration, mobile app, improved RAG |
| 17 | **Resources & Links** | 1 | GitHub, live app, documentation |

**Target: 30-40 pages** (RMS was 57, TDS was 22 — aim for the middle, with more substance per page)

---

## 9. Role Narratives (Draft Material)

### Semyon Fox — Tech Lead / Full-Stack / DevOps

Served as technical lead responsible for system architecture, infrastructure, and the majority of feature development. Key contributions include:

- **Architecture & Infrastructure:** Designed and implemented the full AWS infrastructure (Amplify, RDS, S3, SQS, ECS Fargate, ElastiCache, SES). Made all major architectural decisions including the BullMQ → SQS migration and Cohere embedding integration.
- **Frontend:** Built the VSCode-style note editor UI, file tree, command palette, settings page, Canvas import UI, and AI chat interface. Implemented i18n across 12 languages.
- **Backend:** Developed API routes for notes CRUD, file upload, Canvas import orchestration, AI chat with RAG, and auth middleware with rate limiting.
- **DevOps:** Configured Amplify CI/CD pipeline, ECS Fargate worker deployment, database migrations, and environment management across dev/main/production branches.
- **Canvas Integration:** Built the full Canvas LMS import pipeline from API integration through to S3 storage and RAG embedding.

### Samuel Regan — Auth / RAG Pipeline

Contributed to authentication and the initial RAG pipeline implementation:

- **Authentication:** Developed the login/register UI prototype, password reset functionality with Nodemailer (later migrated to SES), and middleware route protection.
- **RAG Pipeline:** Implemented initial PDF text extraction, chunking algorithm, and embedding generation. This was later integrated and extended with Cohere embeddings and the full search pipeline.

---

## 10. Immediate Action Items

### Screenshots Needed
- [ ] Landing page (desktop + mobile)
- [ ] Login / Register pages
- [ ] Notes editor (with file tree, split pane, PDF viewer)
- [ ] Canvas import settings + progress toast
- [ ] AI chat interface (with context)
- [ ] Settings page (theme, language, profile)
- [ ] File tree with Canvas-imported course structure

### Diagrams to Create
- [ ] System architecture overview (AWS services + data flow)
- [ ] Authentication flow (email + OAuth paths)
- [ ] Canvas import pipeline flow
- [ ] RAG query flow
- [ ] Database ER diagram
- [ ] CI/CD pipeline diagram

### Content to Write
- [ ] Project overview (problem statement + solution)
- [ ] Feature descriptions (pair with screenshots)
- [ ] Architecture narrative
- [ ] API documentation summary
- [ ] Design decisions section (use pivot material above)
- [ ] Testing section
- [ ] Project management section
- [ ] Individual reflections

### Technical Prep
- [ ] Ensure oghmanotes.ie is live and working for demo
- [ ] Clean up GitHub repos (READMEs, remove sensitive data)
- [ ] Export GitHub Projects board screenshot
- [ ] Verify all features work end-to-end for screenshots

---

## 11. What Makes This Report Stand Out vs Samples

| Aspect | RMS/TDS | OghmaNotes |
|--------|---------|------------|
| **Infrastructure** | Firebase (managed) | Full AWS stack (RDS, S3, SQS, ECS, Amplify) — production-grade |
| **AI/ML** | None | RAG pipeline with vector search, LLM integration, OCR |
| **External Integration** | Google Maps embed, Stripe | Canvas LMS API, Cohere API, Marker OCR API |
| **Architectural Depth** | Config descriptions | 6 documented architectural pivots with rationale |
| **AI Disclosure** | None | Transparent, reflective disclosure |
| **Scale** | ~50-100 commits | 849 commits |
| **Deployment** | Firebase Hosting | Multi-service AWS with self-scaling workers |
| **Database** | Firestore (NoSQL) / Firestore (NoSQL) | PostgreSQL with pgvector, 22+ migrations |

---

## 12. Key Dates & Timeline for Gantt/Timeline

| Period | Phase | Key Activities |
|--------|-------|---------------|
| Sep 2025 | **Planning** | Initial commit, Next.js setup, early docs |
| Oct–Nov 2025 | **Sem 1 Dev** | Login prototype (Samuel), auth system, Docker setup, documentation |
| Dec 2025 | **Sem 1 Wrap** | API fixes, deployment debugging, schema work |
| Jan 2026 | **Sem 2 Restart** | Fresh Next.js init, Tailwind templates, project restructure |
| Feb 2026 | **Core Build** | AWS Amplify deployment, S3 storage, editor redesign (VSCode-style), auth security, RAG quickstart, Canvas API research. **105 commits on Feb 17 alone** |
| Mar 1-10 | **Feature Sprint** | Canvas import, RAG pipeline merge, BullMQ → SQS migration, ECS Fargate worker, Cohere embeddings, chat UI, i18n |
| Mar 15-25 | **Polish & Fix** | PDF viewer bugs, database consolidation, domain migration (oghmanotes.ie), SES email, translations, UI/UX audit, observability |
| Mar 26+ | **Report & Demo Prep** | This document, SRS backfill, report writing, demo preparation |
