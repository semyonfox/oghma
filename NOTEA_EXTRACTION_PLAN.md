# Notea Extraction & Porting Plan

## Overview

This document details what Notea provides, what we keep from socsboard, and how to port/adapt Notea components into the AI learning platform.

**Key principle**: Copy what we need, adapt to App Router (not Pages Router), integrate with socsboard's auth, and replace outdated UI with Tailwind + modern React 19 patterns.

---

## 1. Feature Comparison: Notea vs Socsboard

### Notea Features (v0.4.0-alpha)

| Feature | Status | Notes |
|---------|--------|-------|
| **Storage** | ✅ Core | S3-compatible (AWS S3, MinIO, etc.) with signed URLs |
| **Note Editor** | ✅ Core | Rich markdown editor (@notea/rich-markdown-editor), ProseMirror-based |
| **File Tree / Sidebar** | ✅ Core | Hierarchical note organization, favorites, search |
| **MD Rendering** | ✅ Core | Built into editor; also separate render pipeline |
| **Note Format** | ✅ Core | Markdown with metadata (title, created/updated dates, tags) |
| **Trash / Delete** | ✅ Core | Soft delete with recovery |
| **Settings Panel** | ✅ Optional | Theme, UI preferences; password reset in original |
| **Auth** | ❌ Skip | Single-password model (Notea); we replace with socsboard JWT/multi-user |
| **I18n** | ✅ Keep | Multi-language support; archive in Phase 1, activate when needed |
| **Embeds** | ⚠️ Optional | Bookmarks, link previews; nice-to-have, not MVP |
| **Backlinks** | ⚠️ Optional | Bi-directional note linking; cool but not MVP |
| **Share / Public Links** | ✅ Archive | Infrastructure preserved for Phase 2+ (collab, study groups) |

### Socsboard Features (Current)

| Feature | Status | Notes |
|---------|--------|-------|
| **Multi-user Auth** | ✅ Core | Email/password, JWT, bcrypt, HTTP-only cookies |
| **PostgreSQL** | ✅ Core | User management, session tracking |
| **Dashboard / Landing** | ✅ Core | Basic pages; will enhance |
| **Next.js 16 App Router** | ✅ Core | Modern; API routes at `apps/web/src/app/api/` |
| **React 19** | ✅ Core | Latest; use modern patterns |
| **Tailwind + PostCSS 4** | ✅ Core | Already configured |
| **JWT + HTTP-only cookies** | ✅ Core | Secure session model; perfect for multi-user |

---

## 2. What We Extract from Notea

### Core S3 Storage Layer

**Source**: `libs/server/store/providers/s3.ts` + base class `libs/server/store/providers/base.ts`

**What it does**:
- Abstracts S3-compatible storage (AWS S3, MinIO, etc.)
- Handles signed URLs (pre-signed GET requests, supports MinIO quirks)
- Core CRUD: `getObject()`, `putObject()`, `deleteObject()`, `copyObject()`
- Metadata support: stores custom metadata alongside objects

**How to adapt**:
- Copy to: `apps/web/src/lib/storage/s3-provider.ts`
- Keep the abstract `StoreProvider` base class pattern (extensible for future storage backends)
- Remove Notea-specific logging (import from socsboard's logger if available)
- Configuration: read from env vars (STORAGE_BUCKET, STORAGE_ACCESS_KEY, etc.)

**Dependencies to add** (if not already in socsboard):
```json
"@aws-sdk/client-s3": "^3.10.0",
"@aws-sdk/s3-request-presigner": "^3.10.0",
"minio": "^7.0.32"
```

---

### Note Editor Component

**Source**: `components/editor/editor.tsx` + dependencies

**What it does**:
- Rich markdown editing with ProseMirror
- Integrates with state management (EditorState container)
- Handles image uploads (though Notea's upload goes to filesystem; we'll adapt to S3)
- Markdown extensions (bracket links, embeds)

**Key dependencies**:
- `@notea/rich-markdown-editor` (v11.22.0) — custom fork of markdown-editor
- `prosemirror-inputrules` — ProseMirror plugin
- Notea's extensions: `components/editor/extensions/`

**How to adapt**:
- **Option A (Recommended)**: Use Notea's editor as-is initially for speed
  - Copy: `components/editor/` → `apps/web/src/components/editor/`
  - Adapt state management from Notea's `unstated-next` to socsboard's context (or keep unstated for now)
  - Adapt image upload: intercept Notea's `onUploadImage`, send to S3 via socsboard's proxy route
  
- **Option B (Future)**: Replace with maintained alternative
  - Candidates: CodeMirror 6 + markdown extensions, Tiptap (modern & maintained)
  - Lower priority; Notea's editor is functional for MVP

**Notea's editor dependencies** (add to socsboard):
```json
"@notea/rich-markdown-editor": "11.22.0",
"prosemirror-inputrules": "^1.1.3",
"@heroicons/react": "^1.0.1"  // already in socsboard!
```

---

### Markdown Rendering

**Source**: `libs/web/utils/markdown.ts` + Notea's markdown pipeline

**What it does**:
- Converts Markdown to HTML for preview/display
- Uses `highlight.js` for syntax highlighting
- Processes links, embeds, metadata

**How to adapt**:
- Copy rendering utility functions to: `apps/web/src/lib/markdown/`
- Integrate with editor for live preview (or keep simple at first)

**Dependencies**:
```json
"highlight.js": "^10.7.2",
"markdown-link-extractor": "^4.0.1"
```

---

### File Tree / Sidebar UI

**Source**: `components/sidebar/` + state management `libs/web/state/tree.ts`

**What it does**:
- Hierarchical note tree (folders/subfolders)
- Favorites, search, drag-and-drop support
- Uses `@atlaskit/tree` for tree UI

**How to adapt**:
- Copy: `components/sidebar/` → `apps/web/src/components/notes/sidebar/`
- Adapt state from `unstated-next` to socsboard patterns (or keep as-is for MVP)
- Styling: migrate from Material-UI to Tailwind (or use existing Material-UI + Tailwind together temporarily)

**Dependencies**:
```json
"@atlaskit/tree": "^8.6.3"
```

---

### Note CRUD API / State Management

**Source**: `libs/web/api/note.ts`, `libs/web/state/note.ts`, `libs/web/cache/note.ts`

**What it does**:
- Client-side hooks for note operations: `find()`, `create()`, `mutate()`, `delete()`
- LocalForage caching for offline support (skip for MVP)
- Optimistic updates

**How to adapt**:
- Copy to: `apps/web/src/lib/notes/`
- Replace Notea's API endpoints (`/api/notes/*`) with socsboard equivalents (we'll design new routes)
- Keep the hook pattern; adapt to socsboard's auth (JWT headers already in place)

---

### Note Format / Schema

**Source**: `libs/shared/note.ts`

```typescript
export interface NoteModel {
  id: string;
  title: string;
  content: string; // markdown
  createdAt: number;
  updatedAt: number;
  tags?: string[];
  meta?: Record<string, any>;
}
```

**How to adapt**:
- Copy to: `apps/web/src/lib/notes/types.ts`
- Extend with user ownership (add `userId: string`)
- Optional: add fields for AI metadata (e.g., `aiSummary`, `studyLevel`)

---

## 3. What We Keep / Build From Socsboard

### Auth System (Don't Touch, Reuse)

**Source**: `apps/web/src/app/api/auth/`, `apps/web/src/lib/auth.js`

- JWT tokens + HTTP-only cookies
- bcrypt password hashing
- Multi-user support
- Already secure and tested

**Integration point**: When users create notes, attach `userId` from JWT claim. S3 objects namespaced by user (`s3://bucket/users/{userId}/notes/...`).

---

### Database (PostgreSQL)

**Current setup**: `apps/web/src/lib/database/pgsql.js`

**What we need to add**:
- `users` table (already exists for auth)
- `notes` table (metadata: id, userId, title, createdAt, updatedAt, s3Path)
- `note_tags` table (optional; tags per note)

**Design decision**: Store note *metadata* in PostgreSQL, note *content* in S3. This allows:
- Fast queries (list all user's notes, sort by date, search titles)
- S3 handles large file storage efficiently
- Metadata can be indexed/searched

---

### Landing Page / Dashboard

**Current**: `apps/web/src/app/page.js` (basic), `apps/web/src/pages/LandingPage.jsx` (Tailwind template)

**What to do**:
- Keep landing page as-is for now
- Add authenticated dashboard (`/dashboard`) with notes list + quick actions
- Link to notes app (`/notes`)

---

## 4. Implementation Roadmap

### Phase 1: Setup & Foundation (Days 1–2)

1. **Copy Notea extraction files** into socsboard:
   - S3 storage layer → `apps/web/src/lib/storage/`
   - Editor components → `apps/web/src/components/editor/`
   - Note API/state → `apps/web/src/lib/notes/`
   - Markdown utilities → `apps/web/src/lib/markdown/`

2. **Add dependencies** to socsboard `apps/web/package.json`:
   ```json
   "@aws-sdk/client-s3": "^3.10.0",
   "@aws-sdk/s3-request-presigner": "^3.10.0",
   "minio": "^7.0.32",
   "@notea/rich-markdown-editor": "11.22.0",
   "prosemirror-inputrules": "^1.1.3",
   "@atlaskit/tree": "^8.6.3",
   "highlight.js": "^10.7.2",
   "localforage": "^1.9.0"
   ```

3. **Create database schema** for notes:
   ```sql
   CREATE TABLE notes (
     id UUID PRIMARY KEY,
     user_id INT REFERENCES users(id) ON DELETE CASCADE,
     title VARCHAR(255),
     s3_path VARCHAR(512),
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     tags TEXT[]
   );
   ```

4. **Environment setup**:
   ```
   STORAGE_BUCKET=my-notea-bucket
   STORAGE_ACCESS_KEY=...
   STORAGE_SECRET_KEY=...
   STORAGE_ENDPOINT=https://s3.amazonaws.com  # or MinIO endpoint
   STORAGE_REGION=us-east-1
   ```

---

### Phase 2: API Routes (Days 2–3)

Create new API routes in `apps/web/src/app/api/notes/`:

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/notes` | GET | List user's notes (from PostgreSQL) |
| `/api/notes` | POST | Create new note |
| `/api/notes/[id]` | GET | Fetch note content from S3 + metadata |
| `/api/notes/[id]` | POST | Update note (content → S3, metadata → PostgreSQL) |
| `/api/notes/[id]` | DELETE | Delete note (soft delete or hard delete + S3 cleanup) |
| `/api/notes/[id]/presigned-url` | GET | Get signed S3 URL for direct upload (optional optimization) |

**Key point**: Routes use JWT auth (already in socsboard), extract `userId` from token, namespace S3 paths by user.

---

### Phase 3: UI Integration (Days 3–5)

1. **Create `/notes` page** (`apps/web/src/app/notes/page.js`):
   - Layout: sidebar (file tree) + main editor
   - Use Notea's sidebar + editor components
   - Wire to new API routes

2. **Adapt state management**:
   - Keep Notea's `unstated-next` containers for now (quick), or migrate to socsboard patterns later
   - Ensure state reads/writes sync with new API routes

3. **Test editor → S3 integration**:
   - Create note → S3
   - Edit note → update S3 + PostgreSQL
   - Load note → fetch from S3 + metadata from PostgreSQL

---

### Phase 4: AI Integration (Days 5–6)

See `AI_KEY_PROXY.md` (separate doc; uses Vercel `ai` package).

---

## 5. What We Archive (Preserved for Later)

| Feature | Status | Reason |
|---------|--------|--------|
| i18n (Internationalization) | ✅ Keep | Lightweight setup; future-proof for international expansion; copy in Phase 1 |
| Sharing Infrastructure | ✅ Archive | Preserve for Phase 2+ (study groups, class sharing, public notes); no cost to keep |
| Notea's auth system | ❌ Skip | We use socsboard's JWT/multi-user instead |
| Notea's Material-UI styling | ⚠️ Migrate | We use Tailwind; migrate UI gradually as needed |
| Notea's backlinks/embeds | ⚠️ Skip | Nice-to-have; not MVP; add in Phase 2+ if requested |
| Notea's import/export tools | ❌ Skip | Can add later if needed |

**See `DECISION_I18N_AND_SHARING.md` for detailed analysis of i18n & sharing decisions.**

---

## 6. Key Code Snippets for Reference

### S3 Provider Usage

```typescript
// apps/web/src/lib/storage/index.ts
import { StoreS3 } from './s3-provider';

const store = new StoreS3({
  bucket: process.env.STORAGE_BUCKET,
  accessKey: process.env.STORAGE_ACCESS_KEY,
  secretKey: process.env.STORAGE_SECRET_KEY,
  endPoint: process.env.STORAGE_ENDPOINT,
  region: process.env.STORAGE_REGION,
});

// In API route:
await store.putObject(`users/${userId}/notes/${noteId}.md`, noteContent);
const content = await store.getObject(`users/${userId}/notes/${noteId}.md`);
const signedUrl = await store.getSignUrl(`users/${userId}/notes/${noteId}.md`, 3600);
```

### Note Model (Extended)

```typescript
// apps/web/src/lib/notes/types.ts
export interface NoteModel {
  id: string;
  userId: string;
  title: string;
  content?: string; // lazy-loaded from S3
  s3Path: string;
  createdAt: number;
  updatedAt: number;
  tags?: string[];
  aiMetadata?: {
    summary?: string;
    difficulty?: 'beginner' | 'intermediate' | 'advanced';
  };
}
```

---

## 7. Migration Checklist

- [ ] Clone Notea reference locally (`~/projects/notea-upstream`)
- [ ] Create `feature/studyhub` branch in socsboard (or work directly on dev→production flow)
- [ ] Copy Notea's S3 provider to `apps/web/src/lib/storage/`
- [ ] Copy editor components to `apps/web/src/components/editor/`
- [ ] Update `package.json` with new dependencies
- [ ] Create PostgreSQL schema for notes
- [ ] Implement `/api/notes/*` routes
- [ ] Build `/notes` page with sidebar + editor
- [ ] Test S3 read/write with sample note
- [ ] Integrate Canvas API key storage (placeholder for now)
- [ ] Integrate OpenAI/AI provider proxy (BYO key model)
- [ ] Audit all extracted code for outdated patterns
- [ ] Document any remaining technical debt

---

## 8. Technical Debt & Future Work

- **Notea's editor**: v11.22.0 is a custom fork; consider upgrading to maintained alternative (Tiptap, CodeMirror)
- **State management**: Notea uses `unstated-next` (lightweight); socsboard uses React Context. Pick one pattern for consistency
- **Material-UI in Notea**: Gradual migration to Tailwind (or keep both for speed)
- **Offline support**: Notea has `localforage` caching; skipped for MVP but valuable for future
- **Backlinks**: Graph of note connections; valuable for study but non-MVP

---

## Questions / Decisions to Make

1. **Note storage**: Flat structure (`bucket/users/{userId}/...`) or folder-like (`bucket/users/{userId}/folders/...`)?
2. **Compression**: Should large notes be gzip-compressed in S3? Notea doesn't do this by default.
3. **Versioning**: Keep edit history (versions) in S3, or just current state?
4. **AI metadata**: How much context about AI interactions (e.g., summaries) should we store per note?
5. **Canvas integration**: Direct sync notes ↔ Canvas, or just lookup/reference?
