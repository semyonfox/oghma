# Implementation Quick Reference

## What to Bring from Notea (High Value)

### ✅ Core S3 Storage (`libs/server/store/providers/`)
- **S3Provider class**: CRUD for objects, signed URLs, MinIO support
- **Copy to**: `apps/web/src/lib/storage/s3-provider.ts`
- **Why**: Mature, tested, S3-compatible abstraction

### ✅ Rich Markdown Editor (`components/editor/`)
- **Editor component**: ProseMirror-based, markdown support, live preview
- **Copy to**: `apps/web/src/components/editor/`
- **Dependencies**: `@notea/rich-markdown-editor`, `prosemirror-*`
- **Why**: Full-featured, good UX

### ✅ File Tree / Sidebar (`components/sidebar/`)
- **Hierarchical note browser**: Tree structure, favorites, drag-and-drop
- **Copy to**: `apps/web/src/components/notes/sidebar/`
- **Dependencies**: `@atlaskit/tree`
- **Why**: Familiar Notion-like UX

### ✅ Note API / State Management (`libs/web/api/`, `libs/web/state/`)
- **Hooks & containers**: `useNoteAPI()`, `EditorState`, `NoteTreeState`
- **Copy to**: `apps/web/src/lib/notes/`
- **Pattern**: `unstated-next` (lightweight containers)
- **Why**: Simplifies complex state; same pattern works across components

### ✅ Markdown Utilities (`libs/web/utils/markdown.ts`)
- **Parsing & rendering**: MD → HTML, syntax highlighting
- **Copy to**: `apps/web/src/lib/markdown/`
- **Why**: Pre-built rendering pipeline

### ✅ Note Format / Schema (`libs/shared/note.ts`)
- **Interface**: `NoteModel` (id, title, content, dates, tags)
- **Extend**: Add `userId`, `s3Path`, optional `aiMetadata`
- **Copy to**: `apps/web/src/lib/notes/types.ts`

---

## What to Keep from Socsboard (Don't Replace)

| Feature | Keep As-Is | Why |
|---------|-----------|-----|
| JWT Auth | ✅ Yes | Secure, already tested, multi-user |
| PostgreSQL | ✅ Yes | Extend with `notes` table |
| Next.js 16 App Router | ✅ Yes | Modern, API routes at `/app/api/` |
| React 19 | ✅ Yes | Latest, better performance |
| Tailwind + PostCSS 4 | ✅ Yes | Styling, responsive design |
| HTTP-only cookies | ✅ Yes | Session management, security |

---

## Database Changes Required

### Add `notes` Table

```sql
CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  s3_path VARCHAR(512) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP, -- soft delete
  tags TEXT[] DEFAULT '{}',
  
  -- Optional: AI metadata
  ai_summary TEXT,
  ai_difficulty VARCHAR(20), -- beginner, intermediate, advanced
  
  INDEX idx_user_notes (user_id, created_at DESC),
  INDEX idx_title_search (title) -- for search
);
```

### Optional: Add `note_tags` Table

```sql
CREATE TABLE note_tags (
  id SERIAL PRIMARY KEY,
  note_id UUID REFERENCES notes(id) ON DELETE CASCADE,
  tag VARCHAR(50),
  UNIQUE(note_id, tag)
);
```

---

## API Routes to Create

### `src/app/api/notes/`

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/notes` | GET | List all user notes (paginated) | JWT |
| `/api/notes` | POST | Create new note | JWT |
| `/api/notes/[id]` | GET | Fetch note + metadata | JWT |
| `/api/notes/[id]` | PATCH | Update note (content → S3, meta → DB) | JWT |
| `/api/notes/[id]` | DELETE | Delete note (soft delete) | JWT |
| `/api/notes/[id]/content` | GET | Fetch content from S3 (direct URL) | JWT |
| `/api/notes/search` | GET | Search notes by title/tags | JWT |

### `src/app/api/ai/` (See `AI_KEY_PROXY.md`)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/ai/chat` | POST | Stream chat responses |
| `/api/ai/summarize` | POST | Generate note summary |
| `/api/ai/explain` | POST | Explain concept in note |

---

## New UI Pages to Create

| Page | Route | Components | Purpose |
|------|-------|-----------|---------|
| Notes Dashboard | `/notes` | Sidebar + Editor | Main note app |
| Note List | `/notes/list` | Table, filters | Browse all notes |
| Settings | `/settings` | API key form, preferences | AI key setup |
| Note Search | `/notes/search` | Search input, results | Find notes |

---

## Dependencies to Add

### S3 + Storage
```json
"@aws-sdk/client-s3": "^3.10.0",
"@aws-sdk/s3-request-presigner": "^3.10.0",
"minio": "^7.0.32"
```

### Editor & Markdown
```json
"@notea/rich-markdown-editor": "11.22.0",
"prosemirror-inputrules": "^1.1.3",
"highlight.js": "^10.7.2",
"markdown-link-extractor": "^4.0.1",
"remove-markdown": "^0.3.0"
```

### UI Components
```json
"@atlaskit/tree": "^8.6.3",
"react-split": "^2.0.9",
"react-hotkeys-hook": "^3.3.1"
```

### State Management
```json
"unstated-next": "^1.1.0"
```

### AI Integration
```json
"ai": "^3.1.0",
"@ai-sdk/openai": "^0.0.53",
"@ai-sdk/cohere": "^0.0.12",
"@ai-sdk/anthropic": "^0.0.30"
```

### Optional (For MVP, but useful)
```json
"localforage": "^1.9.0",  // Offline caching
"nanoid": "^3.1.22"       // ID generation
```

---

## Environment Variables

### Storage (Required for Notes)
```
STORAGE_BUCKET=my-bucket
STORAGE_ACCESS_KEY=...
STORAGE_SECRET_KEY=...
STORAGE_ENDPOINT=https://s3.amazonaws.com
STORAGE_REGION=us-east-1
STORAGE_PATH_STYLE=false
```

### Database (Already configured, extend)
```
DATABASE_URL=postgres://user:pass@localhost:5432/socsboard
```

### AI (Optional, user-provided at runtime)
```
NEXT_PUBLIC_AI_ENABLED=true
NEXT_PUBLIC_AI_PROVIDERS=openai,cohere,anthropic
```

### Canvas (Future)
```
CANVAS_DOMAIN=universityofgalway.instructure.com
```

---

## File Tree After Extraction

```
apps/web/src/
├── app/
│   ├── api/
│   │   ├── auth/          (keep existing)
│   │   ├── notes/         (NEW)
│   │   │   ├── route.ts   (GET /notes, POST /notes)
│   │   │   └── [id]/      (NEW)
│   │   │       ├── route.ts
│   │   │       └── content/route.ts
│   │   └── ai/            (NEW)
│   │       ├── chat/route.ts
│   │       ├── summarize/route.ts
│   │       └── explain/route.ts
│   ├── notes/             (NEW)
│   │   └── page.js        (Main notes app)
│   ├── settings/          (NEW)
│   │   └── page.js
│   └── page.js            (existing landing)
├── components/
│   ├── editor/            (FROM Notea)
│   │   ├── editor.tsx
│   │   ├── main-editor.tsx
│   │   ├── extensions/
│   │   └── theme.ts
│   ├── notes/             (NEW wrapper)
│   │   └── sidebar/       (FROM Notea)
│   └── ai/                (NEW)
│       └── api-key-form.tsx
├── lib/
│   ├── storage/           (FROM Notea)
│   │   ├── s3-provider.ts
│   │   └── index.ts
│   ├── notes/             (FROM Notea + NEW)
│   │   ├── types.ts       (Extended NoteModel)
│   │   ├── api.ts         (hooks)
│   │   └── state.ts       (containers)
│   ├── markdown/          (FROM Notea)
│   │   └── utils.ts
│   ├── ai/                (NEW)
│   │   ├── client.ts      (sessionStorage helpers)
│   │   └── use-chat.ts    (hook)
│   ├── auth.js            (keep existing)
│   └── database/          (keep + extend)
└── context/               (keep existing or migrate to unstated-next)
```

---

## Testing Strategy (TODO After Implementation)

### Unit Tests
- S3 provider (mock AWS SDK)
- Note CRUD endpoints (mock DB)
- AI proxy (mock Vercel `ai`)

### Integration Tests
- Full flow: create note → S3 → DB → fetch
- AI key validation → chat response

### E2E Tests
- User logs in
- Creates note with editor
- Types content → saves to S3
- Loads note → content fetches
- Sends to AI → response appears

---

## Rollback Points

If something breaks:
1. Local commits can be reset (`git reset --hard HEAD~1`)
2. No pushes until Monday, so GitHub is clean
3. Notea reference still in `/home/semyon/projects/notea-upstream/`

---

## Next Steps (Ready to Code?)

1. ✅ Reference docs created (`NOTEA_EXTRACTION_PLAN.md`, `AI_KEY_PROXY.md`)
2. ⏳ **Begin Phase 1**: Copy files, install dependencies, set up DB
3. ⏳ **Phase 2**: Implement `/api/notes/*` routes
4. ⏳ **Phase 3**: Build `/notes` UI
5. ⏳ **Phase 4**: AI integration

Confirm ready to start Phase 1?
