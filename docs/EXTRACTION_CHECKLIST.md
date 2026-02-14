# Phase 1 Extraction Checklist

## Overview
This checklist guides the extraction of Notea components into socsboard. All tasks are Phase 1 (Days 1–2).

**Key principle**: Copy, don't restructure. Minimum refactoring until MVP works.

---

## Pre-Extraction

### Setup
- [ ] Reference clone exists: `~/projects/notea-upstream/`
- [ ] Working directory: `~/code/university/ct216-software-eng/socsboard/`
- [ ] Git status clean (no uncommitted changes)
- [ ] Branch: On `production` (or create `feature/studyhub` locally)

---

## 1. S3 Storage Layer

### Copy Files
- [ ] `~/projects/notea-upstream/libs/server/store/providers/s3.ts` → `apps/web/src/lib/storage/s3-provider.ts`
- [ ] `~/projects/notea-upstream/libs/server/store/providers/base.ts` → `apps/web/src/lib/storage/store-provider.ts`
- [ ] `~/projects/notea-upstream/libs/server/store/utils.ts` → `apps/web/src/lib/storage/utils.ts`

### Create Storage Index
- [ ] Create `apps/web/src/lib/storage/index.ts`:
  ```typescript
  export { StoreS3 } from './s3-provider';
  export { StoreProvider } from './store-provider';
  export type { StoreProviderConfig, ObjectOptions } from './store-provider';
  ```

### Remove Notea Dependencies from Copied Code
- [ ] In `s3-provider.ts`: Replace `createLogger('store.s3')` with inline error logging (or create simple logger)
- [ ] Check imports: Use AWS SDK already in socsboard (or add if missing)

### Install Dependencies
- [ ] `pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner minio`

---

## 2. Note Editor Components

### Copy Editor Files
- [ ] `~/projects/notea-upstream/components/editor/` → `apps/web/src/components/editor/`
- [ ] Recursive copy: includes `editor.tsx`, `extensions/`, `theme.ts`, `embeds/`, etc.

### Install Editor Dependencies
- [ ] `pnpm add @notea/rich-markdown-editor prosemirror-inputrules`

### Check Editor Imports
- [ ] Verify all imports in editor components resolve
- [ ] Note: Editor uses `unstated-next` for state (will add separately)

### Migrate Material-UI styling (Optional for MVP)
- [ ] **Defer**: Keep Material-UI for now; migrate to Tailwind in Phase 2
- [ ] In editor components: Leave styling as-is; will refactor after MVP works

---

## 3. File Tree / Sidebar Components

### Copy Sidebar Files
- [ ] `~/projects/notea-upstream/components/sidebar/` → `apps/web/src/components/notes/sidebar/`
- [ ] Includes: `sidebar.tsx`, `sidebar-list.tsx`, `sidebar-tool.tsx`, etc.

### Install Sidebar Dependencies
- [ ] `pnpm add @atlaskit/tree react-split react-hotkeys-hook react-resize-detector`

### Check Sidebar Imports
- [ ] Verify state management imports resolve
- [ ] Will wire to new state management in Phase 2

---

## 4. State Management & API Hooks

### Copy Web State/API Files
- [ ] `~/projects/notea-upstream/libs/web/api/` → `apps/web/src/lib/notes/api/`
- [ ] `~/projects/notea-upstream/libs/web/state/` → `apps/web/src/lib/notes/state/`
- [ ] `~/projects/notea-upstream/libs/web/cache/` → `apps/web/src/lib/notes/cache/`
- [ ] `~/projects/notea-upstream/libs/web/hooks/` → `apps/web/src/lib/notes/hooks/`

### Install State Management Dependencies
- [ ] `pnpm add unstated-next localforage`

### Update API Endpoints (in copied files)
- [ ] In `libs/web/api/note.ts`: Update all `/api/notes/*` endpoints to match socsboard's routes
  - `GET /api/notes/{id}` ← stays same
  - `POST /api/notes` ← stays same
  - `POST /api/notes/{id}` ← stays same
  - **But**: Wire to socsboard's auth (JWT from cookies, extract userId)

---

## 5. Note Format & Types

### Copy Note Schema
- [ ] `~/projects/notea-upstream/libs/shared/note.ts` → `apps/web/src/lib/notes/types.ts`

### Extend Note Model
- [ ] Add `userId: string` (for multi-user)
- [ ] Add `s3Path: string` (location in S3)
- [ ] Optional: Add `aiMetadata?: { summary?: string; difficulty?: 'beginner'|'intermediate'|'advanced' }`

### Copy Metadata Types
- [ ] `~/projects/notea-upstream/libs/shared/meta.ts` → `apps/web/src/lib/notes/meta.ts`
- [ ] Add: `shared` enum (for Phase 2+ sharing)

---

## 6. Markdown Utilities

### Copy Markdown Files
- [ ] `~/projects/notea-upstream/libs/web/utils/markdown.ts` → `apps/web/src/lib/markdown/utils.ts`
- [ ] `~/projects/notea-upstream/libs/shared/markdown/` → `apps/web/src/lib/markdown/shared/`

### Install Markdown Dependencies
- [ ] `pnpm add highlight.js markdown-link-extractor remove-markdown`

---

## 7. i18n (Internationalization) ✨

### Copy i18n Files
- [ ] `~/projects/notea-upstream/locales/` → `apps/web/src/locales/`
- [ ] `~/projects/notea-upstream/libs/web/hooks/use-i18n.tsx` → `apps/web/src/lib/i18n/use-i18n.tsx`
- [ ] `~/projects/notea-upstream/libs/web/utils/i18n-provider.tsx` → `apps/web/src/lib/i18n/i18n-provider.tsx`
- [ ] `~/projects/notea-upstream/scripts/extract-i18n.js` → `scripts/extract-i18n.js`

### Install i18n Dependencies
- [ ] `pnpm add rosetta pupa`

### Create i18n Index
- [ ] Create `apps/web/src/lib/i18n/index.ts`:
  ```typescript
  export { default as I18nProvider } from './i18n-provider';
  export { default as useI18n } from './use-i18n';
  ```

### Integrate i18n in Root Layout
- [ ] In `apps/web/src/app/layout.tsx` or `_app.tsx`:
  ```typescript
  import I18nProvider from '@/lib/i18n/i18n-provider';
  
  export default function RootLayout({ children }) {
    return (
      <I18nProvider locale="en" lngDict={require('@/locales/en').default}>
        {children}
      </I18nProvider>
    );
  }
  ```

### Archive Documentation
- [ ] Create `docs/I18N_IMPLEMENTATION.md`:
  - How to add new language (copy JSON file, translate)
  - How to run extraction script (auto-find new strings)
  - How to use in components (`const { t } = useI18n(); <h1>{t('Key')}</h1>`)

---

## 8. Sharing Infrastructure (Archived for Phase 2+) ✨

### Copy Sharing Components
- [ ] `~/projects/notea-upstream/components/portal/share-modal.tsx` → `apps/web/src/components/notes/sharing/share-modal.tsx`
- [ ] Comment out or mark as "TODO: Phase 2"

### Archive Public Page Template
- [ ] Create `docs/SHARING_IMPLEMENTATION.md`:
  - Copy content from `~/projects/notea-upstream/pages/share/[id].tsx`
  - Explain how to adapt to App Router
  - Document public route: `/share/[id]` or `/api/share/[id]`

### Database Schema: Add Sharing Field
- [ ] In notes table migration: Add `shared SMALLINT DEFAULT 0`
  - `0 = PRIVATE, 1 = PUBLIC`

---

## 9. Database Schema

### Create Migration
- [ ] File: `database/migrations/001_create_notes_table.sql`
  ```sql
  CREATE TABLE notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    s3_path VARCHAR(512) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    tags TEXT[] DEFAULT '{}',
    shared SMALLINT DEFAULT 0,
    
    INDEX idx_user_notes (user_id, created_at DESC),
    INDEX idx_title_search (title),
    INDEX idx_shared (shared)
  );
  ```

### Apply Migration
- [ ] Run: `psql $DATABASE_URL < database/migrations/001_create_notes_table.sql`
- [ ] Verify: `\dt` in psql (notes table appears)

---

## 10. Environment Variables

### Create `.env.local` (or update existing)
- [ ] `STORAGE_BUCKET=my-notea-bucket`
- [ ] `STORAGE_ACCESS_KEY=...`
- [ ] `STORAGE_SECRET_KEY=...`
- [ ] `STORAGE_ENDPOINT=https://s3.amazonaws.com`  (or MinIO endpoint)
- [ ] `STORAGE_REGION=us-east-1`
- [ ] `STORAGE_PATH_STYLE=false`  (unless using MinIO, then `true`)

### Create `.env.production` (or document for deployment)
- [ ] Same as above, with production credentials

---

## 11. Update package.json

### Install All New Dependencies
- [ ] `pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner minio`
- [ ] `pnpm add @notea/rich-markdown-editor prosemirror-inputrules`
- [ ] `pnpm add @atlaskit/tree react-split react-hotkeys-hook react-resize-detector`
- [ ] `pnpm add unstated-next localforage`
- [ ] `pnpm add highlight.js markdown-link-extractor remove-markdown`
- [ ] `pnpm add rosetta pupa`
- [ ] `pnpm add nanoid`  (for ID generation)

### Verify Installation
- [ ] `pnpm install`
- [ ] Check: `pnpm list | grep "@aws-sdk"`  (dependencies appear)

---

## 12. Git Commit

### Stage All Changes
- [ ] `git add apps/web/src/lib/storage/`
- [ ] `git add apps/web/src/components/editor/`
- [ ] `git add apps/web/src/components/notes/`
- [ ] `git add apps/web/src/lib/notes/`
- [ ] `git add apps/web/src/lib/markdown/`
- [ ] `git add apps/web/src/lib/i18n/`
- [ ] `git add apps/web/src/locales/`
- [ ] `git add scripts/extract-i18n.js`
- [ ] `git add apps/web/package.json`
- [ ] `git add database/migrations/`
- [ ] `git add docs/`

### Create Commit
- [ ] Message: `feat: extract Notea components (S3, editor, sidebar, i18n, sharing) for AI learning platform pivot`
- [ ] Command: `git commit -m "feat: extract Notea components..."`

### Verify Commit
- [ ] `git log -1 --stat`  (shows all files added)
- [ ] `git status`  (should be clean)

---

## 13. Validation & Testing

### TypeScript Check
- [ ] `cd apps/web && pnpm tsc --noEmit`
- [ ] **Note**: May have type errors from copied components; defer fixing to Phase 2

### Build Check (Optional, may fail due to missing API routes)
- [ ] `pnpm build`
- [ ] **Expected**: May fail if API routes not yet implemented; that's OK for Phase 1

### Manual Inspection
- [ ] Check `apps/web/src/lib/storage/s3-provider.ts` loads (no syntax errors)
- [ ] Check `apps/web/src/components/editor/editor.tsx` loads
- [ ] Check `apps/web/src/lib/i18n/` is present

---

## 14. Documentation

### Create Phase 1 Summary
- [ ] File: `docs/PHASE_1_EXTRACTION_COMPLETE.md`
  - Date completed
  - Files extracted (count)
  - Dependencies added (count)
  - Database changes (migration file)
  - Known issues / deferred work

### Update Main Index
- [ ] `docs/INDEX_AI_PLATFORM.md`: Mark Phase 1 as ✅ Complete

---

## Deferred Work (for Phase 2)

These are intentionally skipped; tackle in Phase 2:

- [ ] API routes: `/api/notes/*` (implement in Phase 2)
- [ ] UI pages: `/notes`, `/notes/[id]`, `/settings` (implement in Phase 2)
- [ ] State wiring: Hook components to new API routes (Phase 2)
- [ ] Image upload: Connect editor's image upload to S3 (Phase 2)
- [ ] Error handling: Comprehensive try-catch and user feedback (Phase 2)
- [ ] Tailwind migration: Migrate Material-UI to Tailwind (Phase 2+)
- [ ] Sharing UI: Activate ShareModal, deploy public page (Phase 2+)
- [ ] AI integration: Set up `/api/ai/chat`, proxy routes (Phase 4)

---

## Post-Phase 1 Checklist

- [ ] All extracted files are copied and organized
- [ ] `package.json` has all new dependencies
- [ ] Database schema created and tested
- [ ] Environment variables documented
- [ ] Git commit created (no pushed yet; local only until Monday)
- [ ] Type errors documented (if any)
- [ ] Ready for Phase 2: API route implementation

---

**Status**: Ready for Phase 1 execution? ✅
