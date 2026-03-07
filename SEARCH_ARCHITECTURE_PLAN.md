# Search Architecture Plan

**Status**: Phase 1 (In Development)  
**GitHub Issues**: #21-25

## Overview

Fuzzy + semantic vector search with sort/filter in tree view. Find files by filename, content, and time via Cmd+K overlay.

## Design Decisions

| Decision | Choice |
|----------|--------|
| Search scope | Filenames + extracted text |
| Semantic timing | Async background job (Bull queue) |
| Sort default | Alphabetical |
| Ranking | Semantic → fuzzy fallback |
| Filter MVP | Sort only (time/alphabetical) |
| UI | Cmd+K overlay (keyboard-first) |

---

## Database Schema Changes

### New: `app.search_index` (Full-Text Search Support)
```sql
-- Enable pgvector extension (if not already)
CREATE EXTENSION IF NOT EXISTS vector;

-- Create function for full-text search vector
CREATE OR REPLACE FUNCTION update_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector = to_tsvector('english', COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.extracted_text, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add columns to app.notes
ALTER TABLE app.notes
  ADD COLUMN IF NOT EXISTS extracted_text TEXT,          -- OCR'd/RAG'd plaintext
  ADD COLUMN IF NOT EXISTS embedding vector(1536),       -- OpenAI embeddings (scalar)
  ADD COLUMN IF NOT EXISTS relative_path TEXT,           -- ./notes/lectures/ct216/lecture1.md
  ADD COLUMN IF NOT EXISTS search_vector tsvector;       -- Full-text search index

-- Create trigger to auto-update search_vector
CREATE TRIGGER notes_search_vector_update
BEFORE INSERT OR UPDATE ON app.notes
FOR EACH ROW
EXECUTE FUNCTION update_search_vector();
```

### Indexes for Scalability

```sql
-- Full-text search index (fast keyword/fuzzy matching)
CREATE INDEX idx_notes_search_vector ON app.notes 
USING GIN (search_vector);

-- Embedding index (fast semantic search via pgvector)
CREATE INDEX idx_notes_embedding ON app.notes 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- User + date filtering (fast recent/old sorting)
CREATE INDEX idx_notes_user_created ON app.notes(user_id, created_at DESC);
CREATE INDEX idx_notes_user_updated ON app.notes(user_id, updated_at DESC);

-- Path lookup (fast breadcrumb navigation)
CREATE INDEX idx_notes_user_path ON app.notes(user_id, relative_path);
```

### Updated: `app.tree_items` (Sort/Filter Support)

Add sort metadata for future extensibility:
```sql
ALTER TABLE app.tree_items
  ADD COLUMN IF NOT EXISTS sort_by VARCHAR(20) DEFAULT 'alphabetical'
    CHECK (sort_by IN ('alphabetical', 'recent', 'custom'));
```

---

## API Endpoints

### 1. Search Files (MVP)

**Endpoint**: `GET /api/search`

**Query Params**:
```
q=lecture              -- Query string (required)
type=fuzzy|semantic    -- Search type (default: semantic)
limit=20               -- Results per page (default: 20)
offset=0               -- Pagination offset (default: 0)
```

**Response**:
```json
{
  "success": true,
  "results": [
    {
      "note_id": 123,
      "title": "lecture1.md",
      "relative_path": "./notes/lectures/ct216/",
      "excerpt": "Lorem ipsum dolor sit amet...",
      "created_at": "2025-03-01T10:30:00Z",
      "updated_at": "2025-03-05T14:22:00Z",
      "relevance_score": 0.95
    }
  ],
  "total": 150,
  "hasMore": true
}
```

**Implementation**:

```javascript
// src/app/api/search/route.js
import sql from '@/database/pgsql.js';
import { validateSession } from '@/lib/auth.js';

export async function GET(request) {
  const user = await validateSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const q = url.searchParams.get('q');
  const type = url.searchParams.get('type') || 'semantic';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0');

  if (!q || q.length < 2) {
    return NextResponse.json({ error: 'Query too short' }, { status: 400 });
  }

  try {
    if (type === 'semantic') {
      // Call embedding service to get vector for query
      const queryEmbedding = await getEmbedding(q);
      
      return await semanticSearch(user.user_id, queryEmbedding, limit, offset);
    } else {
      // Fuzzy full-text search
      return await fuzzySearch(user.user_id, q, limit, offset);
    }
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}

// Semantic search: Find similar documents by embedding distance
async function semanticSearch(userId, queryEmbedding, limit, offset) {
  const results = await sql`
    SELECT 
      note_id,
      title,
      relative_path,
      LEFT(extracted_text, 200) as excerpt,
      created_at,
      updated_at,
      (1 - (embedding <=> ${queryEmbedding}::vector)) as relevance_score
    FROM app.notes
    WHERE user_id = ${userId}
      AND embedding IS NOT NULL
    ORDER BY relevance_score DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const total = await sql`
    SELECT COUNT(*) as count FROM app.notes 
    WHERE user_id = ${userId} AND embedding IS NOT NULL
  `;

  return NextResponse.json({
    success: true,
    results,
    total: total[0].count,
    hasMore: offset + limit < total[0].count
  });
}

// Fuzzy search: Full-text + typo tolerance
async function fuzzySearch(userId, q, limit, offset) {
  const results = await sql`
    SELECT 
      note_id,
      title,
      relative_path,
      LEFT(extracted_text, 200) as excerpt,
      created_at,
      updated_at,
      ts_rank(search_vector, query) as relevance_score
    FROM app.notes,
    plainto_tsquery('english', ${q}) as query
    WHERE user_id = ${userId}
      AND search_vector @@ query
    ORDER BY relevance_score DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const total = await sql`
    SELECT COUNT(*) as count FROM app.notes,
    plainto_tsquery('english', ${q}) as query
    WHERE user_id = ${userId} AND search_vector @@ query
  `;

  return NextResponse.json({
    success: true,
    results,
    total: total[0].count,
    hasMore: offset + limit < total[0].count
  });
}
```

---

### 2. Generate Embeddings (Async Job)

**Endpoint**: `POST /api/notes/:id/embed` (Private/Internal)

**Purpose**: Triggered after RAG extraction, generates vector embedding for semantic search.

**Implementation**:

```javascript
// src/app/api/notes/[id]/embed/route.js
import { validateSession } from '@/lib/auth.js';
import { getEmbedding } from '@/lib/embeddings.js';
import sql from '@/database/pgsql.js';

export async function POST(request, { params }) {
  const user = await validateSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = params;
  
  try {
    // Get note content
    const note = await sql`
      SELECT extracted_text FROM app.notes 
      WHERE note_id = ${id} AND user_id = ${user.user_id}
    `;

    if (!note.length) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }

    // Generate embedding (async)
    const embedding = await getEmbedding(note[0].extracted_text);

    // Store embedding in DB
    await sql`
      UPDATE app.notes 
      SET embedding = ${embedding}::vector
      WHERE note_id = ${id} AND user_id = ${user.user_id}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Embedding error:', error);
    return NextResponse.json({ error: 'Embedding failed' }, { status: 500 });
  }
}
```

**Note**: Queue this job asynchronously when notes are extracted/updated.

---

### 3. Update Tree Sort (Existing Endpoint Refinement)

**Endpoint**: `GET /api/tree?sort=alphabetical|recent`

**Current implementation**: Already exists, refine to support sort param.

```javascript
// src/app/api/tree/route.ts - GET method enhancement
export async function GET(request: Request) {
  const user = await validateSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const sort = url.searchParams.get('sort') || 'alphabetical'; // Default: A-Z
  
  const tree = await getTreeFromPG(user.user_id, sort);
  
  // ... rest of implementation
}

// In pg-tree.js
export async function getTreeFromPG(userId, sortBy = 'alphabetical') {
  try {
    let orderBy = 'name ASC'; // Default
    if (sortBy === 'recent') {
      orderBy = 'updated_at DESC'; // Most recent first
    }

    const rows = await sql`
      SELECT id, note_id, parent_id, is_expanded
      FROM app.tree_items
      WHERE user_id = ${userId}
      ORDER BY parent_id, ${sql.raw(orderBy)}
    `;

    // Build tree structure...
  }
}
```

---

## File Structure

### New Files to Create

```
src/
├── app/api/
│   ├── search/
│   │   └── route.js                  ← NEW: Search endpoint (fuzzy + semantic)
│   └── notes/
│       └── [id]/
│           └── embed/
│               └── route.js          ← NEW: Embedding generation
├── lib/
│   ├── embeddings.js                 ← NEW: Embedding service (OpenAI/local)
│   └── notes/
│       └── storage/
│           └── search.js             ← NEW: Search query builders
```

### Modified Files

```
src/
├── lib/auth.js                       ← No changes (already handles auth)
└── lib/notes/storage/
    └── pg-tree.js                    ← Add sortBy parameter to getTreeFromPG()
```

---

## UI/UX Implementation

### Layout

```
┌─────────────────────────────────────────┐
│ [Search: Cmd+K] [Sort: A-Z ▼]          │
├──────────────┬──────────────────────────┤
│   Tree View  │   Editor/Viewer          │
│   (Compact)  │   (Focus Area)           │
│              │                          │
│ • Documents  │   # Lecture 1            │
│   ├ Module 1 │   Content here...        │
│   └ Module 2 │                          │
│ • Archive    │   [PDF viewer / MD]      │
│              │                          │
└──────────────┴──────────────────────────┘
```

### Search Overlay (Cmd+K)

```
┌─────────────────────────────────┐
│ [Search files...] [Filters]     │
├─────────────────────────────────┤
│ 🔍 lecture                      │
│                                 │
│ 📄 Lecture 1 Notes              │
│    ./notes/lectures/ct216/      │
│    Modified 2 days ago          │
│    Relevance: ████░░░ 85%       │
│                                 │
│ 📄 Lecture 2 Slides             │
│    ./notes/lectures/ct213/      │
│    Modified 4 hours ago         │
│    Relevance: ███░░░░ 65%       │
│                                 │
│ [Load more...]                  │
└─────────────────────────────────┘
```

### Tree Sort Dropdown

```
[Sort by: ▼ Alphabetical]
├─ Alphabetical (A-Z)
├─ Recent (Most modified first)
└─ Created (Newest first)        ← Future: MVP 2
```

---

## Implementation Roadmap

### Phase 1: Core Search (MVP 1)
- [ ] Database schema updates (indexes, columns)
- [ ] Fuzzy search endpoint (`/api/search?type=fuzzy`)
- [ ] Semantic search endpoint (with embeddings)
- [ ] Tree sort refinement (alphabetical + recent)
- [ ] Search UI overlay (Cmd+K)
- [ ] Integration with file viewer (click result → open file)

### Phase 2: Enhanced Filtering (MVP 2)
- [ ] Date range picker
- [ ] Filter UI in search overlay
- [ ] Combined sort + filter logic
- [ ] Saved search filters (user preferences)

### Phase 3: Advanced Features (MVP 3)
- [ ] AI chat to identify files ("show me notes from last week about vectors")
- [ ] Semantic clustering (group similar documents)
- [ ] Cross-document references (links between notes)
- [ ] Full-text highlighting in results

---

## Embedding Service

### Placeholder Implementation

For MVP, use a mock embeddings service. Later, integrate OpenAI/local model.

```javascript
// src/lib/embeddings.js
export async function getEmbedding(text) {
  if (process.env.EMBEDDING_SERVICE === 'openai') {
    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: text.substring(0, 8000), // OpenAI limit
        model: 'text-embedding-3-small'
      })
    });
    const data = await response.json();
    return data.data[0].embedding;
  } else {
    // Mock embedding (random 1536-dim vector)
    return Array(1536).fill(0).map(() => Math.random());
  }
}
```

---

## Scalability

**Current:** 100K+ notes with indexes, sub-100ms queries

**Future scaling:** 
- High embedding volume → tune async queue (Bull)
- 1M+ notes → add Redis query caching
- Embedding model upgrade → add new vector column, migrate, swap

---

## Testing Strategy

### Unit Tests
```javascript
// test/search.test.js
describe('Search API', () => {
  it('should return fuzzy search results', async () => {
    const res = await fetch('/api/search?q=lecture&type=fuzzy');
    expect(res.status).toBe(200);
    expect(res.json.results.length).toBeGreaterThan(0);
  });

  it('should return semantic search results', async () => {
    const res = await fetch('/api/search?q=vectors&type=semantic');
    expect(res.status).toBe(200);
  });

  it('should require authentication', async () => {
    const res = await fetch('/api/search?q=test', { headers: {} });
    expect(res.status).toBe(401);
  });
});
```

### Integration Tests
- [ ] Search finds file by filename
- [ ] Search finds file by extracted text
- [ ] Relative path displays correctly in results
- [ ] Sort toggle changes tree order
- [ ] Click result opens file in editor
- [ ] Embedding generation works async

---

## Environment Variables

```bash
# .env.local
EMBEDDING_SERVICE=openai           # or 'mock' for development
OPENAI_API_KEY=sk-...              # Required if EMBEDDING_SERVICE=openai
PG_VECTOR_DIMENSION=1536           # Match embedding model output
```

---

## References

- **pgvector docs**: https://github.com/pgvector/pgvector
- **PostgreSQL FTS**: https://www.postgresql.org/docs/current/textsearch.html
- **Next.js API Routes**: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
- **OpenAI Embeddings**: https://platform.openai.com/docs/guides/embeddings

---

## Notes for Implementation

1. **Auth is already in place**: All endpoints use `validateSession()` — no changes needed
2. **Database migration**: Run schema updates in separate transaction before code deploy
3. **Backward compat**: Search is new feature, doesn't affect existing tree/notes endpoints
4. **Error handling**: All endpoints return 401 if unauthenticated, 500 if DB fails
5. **Pagination**: Use offset-limit, not cursor (simpler for MVP, add cursor later if needed)

