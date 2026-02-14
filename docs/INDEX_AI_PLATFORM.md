# AI Learning Platform Implementation Docs

## Overview

This folder contains everything needed to understand and implement the pivot from socsboard (university society platform) to an **AI-enhanced learning/study hub**.

**Key status**: Notea codebase analyzed, extraction plan documented. Ready for implementation.

---

## Core Documents

### 1. **NOTEA_EXTRACTION_PLAN.md** ⭐ START HERE
   - Complete analysis of Notea features
   - What to extract, what to skip, what to keep from socsboard
   - Phase-by-phase implementation roadmap
   - Database schema
   - Technical decisions (compression, versioning, etc.)

### 2. **AI_KEY_PROXY.md**
   - BYO API key architecture (sessionStorage → server proxy)
   - Security model (no server-side key storage)
   - Implementation: client-side form, server routes, integration examples
   - Testing strategy

### 3. **QUICK_REFERENCE.md**
   - At-a-glance: what files to copy, where they go
   - API routes to create
   - Database changes
   - Dependencies to install
   - Environment variables
   - File tree after extraction

---

## Directory Reference

### Notea Upstream (for reference)
- `~/projects/notea-upstream/` — Full clone of Notea v0.4.0-alpha
- Key folders:
  - `libs/server/store/providers/s3.ts` — S3 provider (copy this)
  - `components/editor/` — Editor + extensions
  - `components/sidebar/` — File tree UI
  - `libs/web/api/` — Note CRUD hooks
  - `libs/shared/note.ts` — Note schema

### Socsboard (working directory)
- `~/code/university/ct216-software-eng/socsboard/` — Main repo
  - Already has: JWT auth, PostgreSQL, Next.js 16 App Router, React 19, Tailwind
  - Will add: Notes app, S3 storage, AI integration

---

## Implementation Phases

### Phase 1: Setup & Foundation (Days 1–2)
- [ ] Copy S3 provider from Notea
- [ ] Copy editor components + dependencies
- [ ] Create `notes` table in PostgreSQL
- [ ] Set up environment variables

### Phase 2: API Routes (Days 2–3)
- [ ] Implement `/api/notes/*` CRUD endpoints
- [ ] Wire to S3 storage
- [ ] Test note create/read/update/delete

### Phase 3: UI Integration (Days 3–5)
- [ ] Build `/notes` page (sidebar + editor)
- [ ] Integrate Notea's components
- [ ] Connect to API routes
- [ ] Test end-to-end

### Phase 4: AI Integration (Days 5–6)
- [ ] Set up API key form (settings page)
- [ ] Implement `/api/ai/*` proxy routes
- [ ] Add chat/summarize features to notes
- [ ] Test with cheap model (gpt-3.5-turbo or similar)

### Phase 5: Canvas API (Placeholder for now)
- [ ] Store Canvas API key (similar to AI key)
- [ ] (Can implement in Week 2)

---

## Key Decisions Made

✅ **Reuse socsboard auth** — No reimplementation of JWT/bcrypt; perfect for multi-user
✅ **S3 for notes** — Scalable storage; paired with PostgreSQL metadata
✅ **Copy Notea, don't fork** — Extract what we need; avoid dependency on deprecated repo
✅ **BYO AI keys** — User-owned keys, never stored server-side; security + cost-effective
✅ **No branch yet** — Work directly on production (can reset if needed; no pushes until Monday)
✅ **Notea's editor** — Use as-is for MVP; consider replacing with maintained alternative later

---

## Quick Start: Phase 1

### 1. Install Notea locally (reference)
```bash
# Already done: ~/projects/notea-upstream/
```

### 2. Add dependencies to socsboard
```bash
cd ~/code/university/ct216-software-eng/socsboard/apps/web
pnpm add \
  @aws-sdk/client-s3 @aws-sdk/s3-request-presigner minio \
  @notea/rich-markdown-editor prosemirror-inputrules \
  @atlaskit/tree @heroicons/react highlight.js \
  localforage nanoid unstated-next
```

### 3. Copy S3 provider
```bash
# From: ~/projects/notea-upstream/libs/server/store/providers/
# To: apps/web/src/lib/storage/
cp ~/projects/notea-upstream/libs/server/store/providers/s3.ts \
   ~/code/university/ct216-software-eng/socsboard/apps/web/src/lib/storage/s3-provider.ts
```

### 4. Create notes table
```sql
-- In your PostgreSQL client:
CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  s3_path VARCHAR(512) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  tags TEXT[] DEFAULT '{}',
  INDEX idx_user_notes (user_id, created_at DESC)
);
```

### 5. Set environment variables
```bash
# In .env.local:
STORAGE_BUCKET=<redacted>STORAGE_ACCESS_KEY=<redacted>STORAGE_SECRET_KEY=<redacted>STORAGE_ENDPOINT=<redacted>STORAGE_REGION=<redacted>```

---

## Commits (Git Strategy)

- **No pushes until Monday** — Only local commits
- Branch strategy: Work on `production` (or create a feature branch if preferred)
- Commit messages: Keep focused, reference what was done

---

## Team Coordination

- 3 developers on same socsboard repo
- No pushes until Monday (designated time for first release)
- Use this doc as reference; link in Slack if needed

---

## Future Work (Post-MVP)

- [ ] Upgrade editor to Tiptap or CodeMirror
- [ ] Implement offline caching (localforage)
- [ ] Add backlinks feature
- [ ] Integrate Canvas API for direct note/lecture access
- [ ] User studies / learning analytics
- [ ] Mobile app (Expo/React Native)
- [ ] Collaborative editing (multiplayer notes)

---

## Questions?

Refer to specific docs:
- **"How do I extract the S3 provider?"** → `NOTEA_EXTRACTION_PLAN.md` § 2
- **"How do I set up AI keys?"** → `AI_KEY_PROXY.md`
- **"What files do I copy where?"** → `QUICK_REFERENCE.md` (file tree)
- **"What's the database schema?"** → `QUICK_REFERENCE.md` or `NOTEA_EXTRACTION_PLAN.md`

---

## Last Updated

Feb 14, 2025 — Notea analysis complete, implementation plan locked.

**Next review**: After Phase 1 completion (share progress, adjust if needed)
