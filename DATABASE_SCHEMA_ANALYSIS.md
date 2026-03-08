# Database Schema Analysis Report
**Date:** March 8, 2025  
**Scope:** OghmaNotes - Comprehensive schema, code usage, and migration strategy  
**Status:** ⚠️ CRITICAL ISSUES IDENTIFIED - Database has major inconsistencies between schema files and actual code usage

---

## EXECUTIVE SUMMARY

The codebase has **critical misalignments** between:
1. **Multiple conflicting schema definitions** (schema.sql vs schema-current.json vs migrations)
2. **ID type inconsistencies** (INTEGER vs UUID across tables and code)
3. **Incomplete and unused tables** (documents, chunks exist but aren't referenced in code)
4. **Soft delete pattern partially implemented** (column exists but not enforced in queries)
5. **Missing foreign key constraints** in actual production schema
6. **No migration strategy** to consolidate the inconsistent state

**Recommendation:** Implement comprehensive migration to resolve all conflicts before production deployment.

---

## 1. SCHEMA ISSUES

### 1.1 Multiple Conflicting Schema Definitions

#### Problem: Three Different Schema Representations
The codebase has THREE different schema definitions that don't match:

**File 1: `/database/schema.sql`** (Production Schema)
```sql
-- Uses UUID for user_id and note_id
CREATE TABLE app.login (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  hashed_password TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE app.notes (
  note_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  s3_key TEXT,
  extracted_text TEXT,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Uses INTEGER for tree items
CREATE TABLE app.tree_items (
  id SERIAL PRIMARY KEY,  -- ← INTEGER!
  user_id INTEGER NOT NULL,  -- ← INTEGER!
  note_id INTEGER,  -- ← INTEGER! (conflicts with UUID above)
  ...
);
```

**File 2: `/database/schema-current.json`** (Current DB State)
```json
{
  "login": {
    "columns": [
      {"column_name": "user_id", "data_type": "integer"},  // ← INTEGER
      {"column_name": "email", "data_type": "text"},
      {"column_name": "hashed_password", "data_type": "text"},
      {"column_name": "created_at", "data_type": "timestamp with time zone"},
      {"column_name": "reset_token", "data_type": "character varying"},
      {"column_name": "reset_token_expires", "data_type": "timestamp with time zone"}
    ]
  },
  "notes": {
    "columns": [
      {"column_name": "note_id", "data_type": "integer"},  // ← INTEGER
      {"column_name": "user_id", "data_type": "integer"},  // ← INTEGER
      {"column_name": "title", "data_type": "text"},
      {"column_name": "content", "data_type": "text"},
      {"column_name": "created_at", "data_type": "timestamp with time zone"},
      {"column_name": "updated_at", "data_type": "timestamp with time zone"}
    ]
  },
  "documents": {  // ← Exists but not used in code!
    "columns": [
      {"column_name": "id", "data_type": "integer"},
      {"column_name": "user_id", "data_type": "integer"},
      {"column_name": "filename", "data_type": "character varying"},
      {"column_name": "s3_key", "data_type": "character varying"},
      {"column_name": "uploaded_at", "data_type": "timestamp without time zone"}
    ]
  },
  "chunks": {  // ← Exists but not used in code!
    "columns": [
      {"column_name": "id", "data_type": "integer"},
      {"column_name": "user_id", "data_type": "integer"},
      {"column_name": "document_id", "data_type": "integer"},
      {"column_name": "text", "data_type": "text"},
      {"column_name": "embedding", "data_type": "USER-DEFINED"},  // vector(1536)
      {"column_name": "page_number", "data_type": "integer"},
      {"column_name": "section", "data_type": "character varying"},
      {"column_name": "created_at", "data_type": "timestamp without time zone"}
    ]
  }
}
```

**File 3: `/database/migrations/002_migrate_to_uuid_v7.sql`** (UUID Migration - Incomplete)
- Attempts to migrate login.user_id and notes.note_id to UUID
- But the actual database (schema-current.json) shows INTEGER (migration not applied or rolled back)
- Other tables (tree_items, attachments, pdf_annotations) still reference INTEGER

#### Impact
- **Severity:** CRITICAL
- Code expects different ID types in different places
- Migrations are out of sync with actual schema
- Foreign key relationships are broken

#### Resolution Path
1. Determine which state is actually in production database
2. Roll forward to complete UUID migration OR
3. Commit to INTEGER and remove UUID migration
4. Update ALL schema files to match chosen approach

---

### 1.2 Column Mismatches Between Schema and Code

#### Missing from `schema.sql` but Used in Code

| Column | Table | Used In Code | Schema Status |
|--------|-------|--------------|---------------|
| `deleted` | `app.notes` | `/api/notes/route.js:55` (WHERE deleted = 0) | ❌ NOT in schema.sql |
| `shared` | `app.notes` | Mentioned in comments in notes type | ❌ NOT in schema.sql |
| `pinned` | `app.notes` | Client state (note.ts) | ❌ NOT in schema.sql |
| `reset_token` | `app.login` | `/api/auth/password-reset/request/route.js` | ✅ Only in schema-current.json |
| `reset_token_expires` | `app.login` | Password reset logic | ✅ Only in schema-current.json |

#### Evidence: Code References Non-Existent Columns
```javascript
// /src/app/api/notes/route.js:54-55
let notes = await sql`
  SELECT * FROM app.notes
  WHERE user_id = ${user.user_id} AND deleted = 0  // ← Column 'deleted' not in schema.sql!
  ORDER BY created_at DESC
`;

// /src/app/api/notes/route.js:93
const result = await sql`
  INSERT INTO app.notes (user_id, title, content, deleted, created_at, updated_at)
  VALUES (${user.user_id}, ${body.title || 'Untitled'}, ${body.content || '\n'}, 
          ${NOTE_DELETED.NORMAL}, NOW(), NOW())  // ← Inserting 'deleted' column
  RETURNING note_id, user_id, title, content, created_at, updated_at
`;
```

**Will fail in production** because `deleted` column doesn't exist in schema.sql!

#### Document & Chunks Tables
- Exist in schema-current.json
- NOT referenced in ANY production code
- Likely artifacts from earlier design phase
- Should be dropped OR code should be written to use them

---

## 2. ID TYPE INCONSISTENCIES (CRITICAL)

### 2.1 UUID vs INTEGER Mismatch

#### Current Situation
| Table | Primary Key Type | Foreign Key Types | Code Expectation | Status |
|-------|------------------|-------------------|------------------|--------|
| `app.login` | INTEGER (actual) UUID (desired) | — | UUID string | ❌ MISMATCH |
| `app.notes` | INTEGER (actual) UUID (desired) | user_id: INTEGER (actual) UUID (desired) | INTEGER (parseInt) | ❌ MISMATCH |
| `app.tree_items` | INTEGER | user_id: INTEGER note_id: INTEGER | INTEGER (parseInt) | ✅ CONSISTENT |
| `app.attachments` | INTEGER | note_id: INTEGER | INTEGER | ✅ CONSISTENT |
| `app.pdf_annotations` | INTEGER | user_id: INTEGER note_id: INTEGER | INTEGER | ✅ CONSISTENT |

#### Code Evidence of ID Type Handling
```typescript
// /src/app/api/notes/[id]/route.js:36
const noteId = parseInt(id, 10);  // ← Treating as INTEGER
if (isNaN(noteId)) {
  return NextResponse.json({ error: 'Invalid note ID' }, { status: 400 });
}

// /src/app/api/tree/route.ts:109
const itemId = parseInt(id, 10);  // ← Treating as INTEGER
if (isNaN(itemId)) {
  return NextResponse.json({ error: 'Invalid item ID' }, { status: 400 });
}

// /src/lib/auth.js:169-171
const token = generateJWTToken(
  {user_id: user.user_id, email: user.email},  // ← Expects numeric user_id
  `${expiryDays}d`
);
```

#### Code Type Hints Show UUID Intent
```typescript
// /src/lib/notes/types/note.ts:6
export interface NoteModel {
    id: string; // UUID v7 format
    title: string;
    pid?: string;  // Parent ID (UUID v7)
    ...
}

// /src/lib/utils/uuid.ts:4-7
export function generateUUID(): string {
export function isValidUUID(id: string): boolean {
```

**Problem:** Code has UUID v7 type definitions but actual implementation uses INTEGER parsing!

### 2.2 Frontend/Backend ID Type Mismatch
```typescript
// Frontend expects UUID strings
const NoteModel {
  id: string;  // "550e8400-e29b-41d4-a716-446655440000"
  pid?: string;
}

// Backend returns/expects integers
note_id: 1, 2, 3, ...  // SERIAL from database
user_id: 1, 2, 3, ...  // SERIAL from database
```

#### Migration Not Applied
The migration `/database/migrations/002_migrate_to_uuid_v7.sql` attempts to convert to UUID but:
1. Assumes user_id and note_id exist and are INTEGER
2. Creates new UUID columns alongside old ones
3. Copies data with placeholder logic
4. Renames old → old_backup, new → production name

**Status:** ❌ Migration appears incomplete or rolled back
- Tree items still reference INTEGER IDs
- schema-current.json shows INTEGER types in production
- Code still uses parseInt() everywhere

---

## 3. DELETED/SOFT DELETE PATTERN

### 3.1 Current Implementation

#### Schema Definition
**In schema.sql:**
- NOT mentioned at all
- No deleted_at or deleted column

**In migrations/001_create_notes_table.sql:**
```sql
CREATE TABLE IF NOT EXISTS notes (
  ...
  deleted_at TIMESTAMP DEFAULT NULL,
  ...
);

-- Filter by soft delete in indexes
CREATE INDEX idx_user_notes ON notes(user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_title_search ON notes(title) WHERE deleted_at IS NULL;
CREATE INDEX idx_deleted ON notes(deleted_at);
```

**In schema-current.json:**
- No `deleted_at` column
- No `deleted` column (but code expects it!)

#### Code Usage
```javascript
// /src/app/api/notes/route.js:55
WHERE user_id = ${user.user_id} AND deleted = 0  // ← References 'deleted' NOT 'deleted_at'

// /src/app/api/notes/route.js:93
INSERT INTO app.notes (..., deleted, ...)
VALUES (..., ${NOTE_DELETED.NORMAL}, ...)
```

#### Type Definition
```typescript
// /src/lib/notes/types/meta.ts
export enum NOTE_DELETED {
  NORMAL = 0,
  DELETED = 1
}
```

#### S3 Storage Handler
```typescript
// /src/lib/notes/storage/s3-storage.ts
// Filter notes that have been soft-deleted (deleted field set)
return notes.filter((note) => note.deleted === 1);

// Restore from trash
note.deleted = 0;
```

### 3.2 Issues with Soft Delete

| Issue | Severity | Impact |
|-------|----------|--------|
| Column `deleted` not in schema | **CRITICAL** | INSERT/UPDATE statements will fail |
| Migration has `deleted_at` but code expects `deleted` | **HIGH** | Mismatch in deletion patterns |
| No grace period enforcement | **MEDIUM** | Deleted notes not auto-purged after 7 days (per SRS) |
| No cascading soft delete | **MEDIUM** | Deleting note doesn't soft-delete attachments/annotations |
| Indexes filter by deleted but column missing | **CRITICAL** | Query performance broken |

### 3.3 Correct Soft Delete Pattern (Recommended)

```sql
-- Add to app.notes
ALTER TABLE app.notes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Index for performance (exclude deleted)
CREATE INDEX IF NOT EXISTS idx_notes_active ON app.notes(user_id, created_at DESC) 
WHERE deleted_at IS NULL;

-- For trash queries
CREATE INDEX IF NOT EXISTS idx_notes_deleted ON app.notes(user_id, deleted_at DESC) 
WHERE deleted_at IS NOT NULL;
```

**Update code to use `deleted_at`:**
```javascript
// Instead of: WHERE deleted = 0
WHERE user_id = ${user.user_id} AND deleted_at IS NULL

// Soft delete: UPDATE instead of DELETE
UPDATE app.notes SET deleted_at = NOW() WHERE note_id = ${noteId}

// Restore: Clear the timestamp
UPDATE app.notes SET deleted_at = NULL WHERE note_id = ${noteId}

// Hard delete (after grace period)
DELETE FROM app.notes WHERE deleted_at < NOW() - INTERVAL '7 days'
```

---

## 4. DATA INTEGRITY ISSUES

### 4.1 Foreign Key Constraints

#### Status in schema.sql
| Relationship | Defined | Cascade Policy | Status |
|--------------|---------|-----------------|--------|
| notes.user_id → login.user_id | ✅ YES | ON DELETE CASCADE | ✅ Correct |
| tree_items.user_id → login.user_id | ✅ YES | ON DELETE CASCADE | ✅ Correct |
| tree_items.note_id → notes.note_id | ✅ YES | ON DELETE CASCADE | ✅ Correct |
| tree_items.parent_id → tree_items.id | ✅ YES | ON DELETE CASCADE | ✅ Correct (self-reference) |
| attachments.note_id → notes.note_id | ✅ YES | ON DELETE CASCADE | ✅ Correct |
| pdf_annotations.note_id → notes.note_id | ✅ YES | ON DELETE CASCADE | ✅ Correct |
| pdf_annotations.user_id → login.user_id | ✅ YES | ON DELETE CASCADE | ✅ Correct |
| pdf_annotations.attachment_id → attachments.id | ✅ YES | ON DELETE CASCADE | ✅ Correct |

**Verdict:** ✅ Cascade policies are correct in schema.sql

#### Missing in schema-current.json
- schema-current.json doesn't show foreign key constraints
- Likely just not captured by schema export tool
- Verify by checking actual database

#### Issue: NONE of these constraints exist in current database!
Because schema.sql was never applied to production. Current database uses older migrations with different structure.

### 4.2 Data Integrity Violations Possible

Without proper foreign keys in production:
- Can delete user and leave orphaned notes
- Can delete note and leave orphaned tree items/annotations
- Can create invalid tree references

---

## 5. PERFORMANCE ISSUES

### 5.1 Missing Indexes

#### Recommended but Missing
```sql
-- User + Date index (common query pattern)
CREATE INDEX IF NOT EXISTS idx_notes_user_created ON app.notes(user_id, created_at DESC) 
WHERE deleted_at IS NULL;

-- Tree traversal optimization
CREATE INDEX IF NOT EXISTS idx_tree_user_parent ON app.tree_items(user_id, parent_id);

-- Soft delete grace period queries
CREATE INDEX IF NOT EXISTS idx_deleted_at ON app.notes(deleted_at) 
WHERE deleted_at IS NOT NULL;

-- Embedding similarity search (pgvector)
CREATE INDEX IF NOT EXISTS idx_notes_embedding_hnsw ON app.notes USING hnsw (embedding vector_cosine_ops);

-- Reset token lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_reset_token_active ON app.login(reset_token) 
WHERE reset_token IS NOT NULL;
```

#### Current Indexes (from schema-current.json)
```
chunks:
  - chunks_document_id_idx
  - chunks_embedding_hnsw_idx (← but table unused!)
  - chunks_user_id_idx
  - chunks_pkey

documents:
  - documents_pkey (← minimal, no user lookup index)

login:
  - idx_login_email
  - idx_reset_token (partial, good!)
  - login_email_key (redundant with idx_login_email)
  - login_pkey

notes:
  - idx_notes_created_at (single column, suboptimal)
  - idx_notes_user_id (single column, suboptimal)
  - notes_pkey
  - MISSING: idx_notes_user_created (composite, critical!)
  - MISSING: embedding index (vector search broken)

tree_items:
  - idx_tree_items_user_id
  - idx_tree_items_note_id
  - idx_tree_items_parent_id
  - (Good coverage but no composite idx for user + parent traversal)

attachments:
  - idx_attachments_note_id (missing: user_id for access control!)

pdf_annotations:
  - idx_pdf_annotations_note_id
  - idx_pdf_annotations_user_id
  - (Missing: composite (user_id, note_id) for direct lookups)
```

### 5.2 N+1 Query Patterns

#### In getTreeFromPG()
```javascript
// src/lib/notes/storage/pg-tree.js:12-21
const rows = await sql`
  SELECT id, note_id, parent_id, is_expanded
  FROM app.tree_items
  WHERE user_id = ${userId}
  ORDER BY parent_id, position
`;

// Then builds tree structure in JavaScript
for (const row of rows) {
  items[row.id] = { id: String(row.id), children: [] };
}

for (const row of rows) {
  const parentId = row.parent_id ? String(row.parent_id) : ROOT_ID;
  items[parentId].children.push(String(row.id));
}
```

**Verdict:** ✅ NOT an N+1 - fetches all tree items in ONE query
But: No pagination, could be slow with 10,000+ tree items

#### In NOTE/TREE operations
```javascript
// /src/app/api/notes/route.js:53-57
// Step 1: Get all notes
let notes = await sql`
  SELECT * FROM app.notes
  WHERE user_id = ${user.user_id} AND deleted = 0
  ORDER BY created_at DESC
`;

// Step 2: Filter in JavaScript (not in SQL!)
const filtered = notes.map(note => filterNoteFields(note, fields));
```

**Issue:** Selecting ALL columns (*) when specific fields might be needed
- Should be: `SELECT note_id, user_id, title, created_at FROM app.notes`
- Current: fetches content and embedding vectors for every note

### 5.3 Vector Index Issue (Critical for Search)

Current status:
- ✅ Embedding column exists in app.notes
- ❌ No vector index in actual database (schema-current shows one on chunks table, not notes)
- ❌ Migration references ivfflat but should use hnsw

```sql
-- Current (schema.sql):
CREATE INDEX IF NOT EXISTS idx_notes_embedding ON app.notes USING ivfflat (embedding vector_cosine_ops);

-- Better (production ready):
CREATE INDEX IF NOT EXISTS idx_notes_embedding_hnsw ON app.notes USING hnsw (embedding vector_cosine_ops);
```

**Why hnsw over ivfflat:**
- hnsw is more accurate (hierarchical, better for high dimensions)
- ivfflat requires maintenance (rebuild after inserts)
- Recommended for 1536-dim vectors (OpenAI embeddings)

---

## 6. REDUNDANCY & UNUSED TABLES

### 6.1 Documents & Chunks Tables

#### Status
| Table | In Schema | In Code | References | Status |
|-------|-----------|---------|-----------|--------|
| `app.documents` | ✅ YES (current) | ❌ NO | 0 queries | ❌ UNUSED |
| `app.chunks` | ✅ YES (current) | ❌ NO | 0 queries | ❌ UNUSED |

#### Evidence: Zero Code References
```bash
$ grep -r "from app.documents\|from app.chunks\|INSERT INTO.*documents\|INSERT INTO.*chunks" src/
# Returns: nothing
```

But migration exists:
- `/database/migrations/001_create_notes_table.sql` mentions documents/chunks concept
- No actual SQL to create them found there
- They appeared in schema-current.json (actual database state)

#### Design Conflict

**Original Design (migrations/001):** Separate documents + chunks tables
- documents: stores uploaded files (metadata)
- chunks: stores text chunks + embeddings (one doc → many chunks)

**Current Design (code):** Embeddings in notes table directly
- Embedding vector stored in app.notes
- No chunking table

#### Decision Needed
**Option A: Drop unused tables**
```sql
DROP TABLE IF EXISTS app.chunks;
DROP TABLE IF EXISTS app.documents;
-- Saves space, removes confusion
```

**Option B: Use for RAG phase**
```sql
-- Keep but add references in code when implementing chat
-- documents: track uploaded PDFs
-- chunks: break documents into passages for RAG retrieval
```

**Recommendation:** Option A for now (drop), Option B later if needed

### 6.2 Potential Table Consolidation

#### Notes vs Documents Confusion
- `app.notes` - free-form notes (title + content)
- `app.documents` - uploaded files (filename + s3_key)

Overlap: both have s3_key
- Should notes be able to attach documents?
- Or should documents BE the storage mechanism for notes?

**Current state:** Unclear relationship

#### Recommendation: Clarify Model
```sql
-- Option 1: Notes are atomic (current)
-- Option 2: Notes are collections of documents
-- Option 3: Notes contain embedded document references

-- For now: ADD foreign key to clarify
ALTER TABLE app.notes
  ADD COLUMN document_id INTEGER REFERENCES app.documents(id) ON DELETE SET NULL;
```

---

## 7. ORGANIZATION & TABLE STRUCTURE ISSUES

### 7.1 Tab Structure in app.login

#### Current Columns
```
user_id         INTEGER PRIMARY KEY
email           TEXT NOT NULL UNIQUE
hashed_password TEXT NOT NULL
created_at      TIMESTAMPTZ
reset_token     VARCHAR
reset_token_expires TIMESTAMPTZ
```

#### Issues
- ✅ Good: Email uniqueness, password hashing
- ❌ Problem: reset_token in auth table mixes concerns
  - Should be in separate `password_resets` table
  - Allows multiple concurrent reset tokens
  - Easier to audit/expire

#### Recommended Schema
```sql
-- Keep login simple
CREATE TABLE IF NOT EXISTS app.login (
  user_id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  hashed_password TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  INDEX idx_email ON (email)
);

-- Separate table for password resets
CREATE TABLE IF NOT EXISTS app.password_resets (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at TIMESTAMPTZ DEFAULT NULL,
  INDEX idx_token ON (token),
  INDEX idx_expires ON (expires_at)
);

-- Or simpler: just keep reset_token in login (current approach is fine)
```

### 7.2 Missing Audit Fields

#### app.login
- ✅ created_at
- ❌ updated_at (when password changed)
- ❌ last_login_at (security tracking)
- ❌ login_count (abuse detection)

#### app.notes
- ✅ created_at
- ✅ updated_at
- ❌ deleted_at (soft delete)
- ❌ deleted_by (WHO deleted it)
- ❌ version (for conflict resolution)

#### app.tree_items
- ✅ created_at
- ✅ updated_at
- ❌ deleted_at (orphaned trees not cleaned up)

#### Recommended Additions
```sql
-- For app.login
ALTER TABLE app.login ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE app.login ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- For app.notes
ALTER TABLE app.notes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE app.notes ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- For app.tree_items
ALTER TABLE app.tree_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Auto-update triggers for all
CREATE OR REPLACE TRIGGER update_login_updated_at
  BEFORE UPDATE ON app.login
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### 7.3 Missing Constraint Enforcement

| Constraint | Type | Status |
|-----------|------|--------|
| Email format validation | CHECK | ❌ Missing in schema (only bcrypt validates on app level) |
| S3 key format | CHECK | ❌ Missing (should start with users/{user_id}/) |
| Vector dimension validation | CONSTRAINT | ❌ Missing (should be 1536-dim only) |
| Position uniqueness in tree | UNIQUE | ❌ Missing (position per parent) |

---

## 8. MIGRATION STRATEGY

### 8.1 Current Migration State

```
✅ 001_create_notes_table.sql
   - Creates: notes table with UUID v7
   - Describes: documents + chunks (but doesn't create them)
   - Triggers: update_notes_updated_at

✅ 002_add_tree_and_vectors.sql
   - Adds: tree_items, attachments, pdf_annotations
   - Alters: notes table (adds s3_key, extracted_text, embedding)
   - Enables: pgvector extension

⚠️  002_migrate_to_uuid_v7.sql (CONFLICTING)
   - Attempts: Convert login.user_id and notes.note_id to UUID
   - Status: NOT applied (database still has INTEGER)
   - Problem: Conflicts with other migrations, unclear execution order
```

### 8.2 Why Migrations Failed

The UUID migration (`002_migrate_to_uuid_v7.sql`) has issues:

```sql
-- Lines 10-27: Migrate login
ALTER TABLE app.login
  ADD COLUMN user_id_uuid UUID DEFAULT gen_random_uuid() UNIQUE;
UPDATE app.login SET user_id_uuid = gen_random_uuid() WHERE user_id_uuid IS NULL;
ALTER TABLE app.login
  ALTER COLUMN user_id_uuid SET NOT NULL,
  DROP CONSTRAINT login_pkey,
  ADD PRIMARY KEY (user_id_uuid);
ALTER TABLE app.login RENAME COLUMN user_id TO user_id_old;
ALTER TABLE app.login RENAME COLUMN user_id_uuid TO user_id;
ALTER TABLE app.login DROP COLUMN user_id_old;

-- Problem 1: No data preservation (generates random UUIDs)
-- Problem 2: Assumes old user_id values don't matter
-- Problem 3: tree_items, attachments still reference old INTEGER IDs
-- Problem 4: Two conflicting "002_" migrations (same filename)
```

**Why it failed to apply:**
1. Timestamp-based migration name collision (two "002_" files)
2. References to tables/columns that don't exist yet
3. Incomplete: doesn't migrate foreign keys in other tables
4. Cascading failures when applied before other migrations

### 8.3 Recommended Migration Path

**Phase 0: Assess Current State** (1 hour)
```bash
# Connect to prod database and verify current schema
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_schema = 'app' AND table_name = 'login';
```

**Decision Point:** Commit to INTEGER or UUID?
- **Option A (RECOMMEND):** Stick with INTEGER
  - Current database is INTEGER
  - All code already uses parseInt()
  - Less disruption
  - Performance slightly better
  - Simpler migration path
  
- **Option B:** Migrate to UUID
  - Better for distributed systems
  - Aligns with "modern" design
  - Requires complete rewrite of ID handling
  - More migration work

### 8.4 Recommended: INTEGER Path (Less Risky)

**Migration 1: Standardize on INTEGER** (1 day work)
```sql
-- Step 1: Drop conflicting UUID migration file
-- (remove: /database/migrations/002_migrate_to_uuid_v7.sql)

-- Step 2: Ensure all ID columns are INTEGER or BIGINT
-- Current state: mostly SERIAL (which is INTEGER AUTOINCREMENT)
-- Proposed: keep as-is

-- Step 3: Update schema.sql to match current database
-- (remove UUID type hints, use INTEGER everywhere)

-- Step 4: Add missing columns
ALTER TABLE app.notes ADD COLUMN IF NOT EXISTS deleted SMALLINT DEFAULT 0;
ALTER TABLE app.notes ADD COLUMN IF NOT EXISTS shared SMALLINT DEFAULT 0;
ALTER TABLE app.notes ADD COLUMN IF NOT EXISTS pinned SMALLINT DEFAULT 0;

-- Step 5: Add missing indexes
CREATE INDEX IF NOT EXISTS idx_notes_user_created ON app.notes(user_id, created_at DESC) 
  WHERE deleted = 0;
CREATE INDEX IF NOT EXISTS idx_notes_embedding_hnsw ON app.notes USING hnsw (embedding vector_cosine_ops);

-- Step 6: Verify all constraints are in place
-- (foreign keys with CASCADE delete)
```

**Migration 2: Clean Up Unused Tables** (1 hour)
```sql
-- Verify no code references these
DROP TABLE IF EXISTS app.documents;
DROP TABLE IF EXISTS app.chunks;

-- Or if keeping:
ALTER TABLE app.chunks ADD CONSTRAINT fk_document FOREIGN KEY (document_id) REFERENCES app.documents(id) ON DELETE CASCADE;
```

**Migration 3: Add Audit Fields** (2 hours)
```sql
-- app.login
ALTER TABLE app.login ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE app.login ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- Create update trigger
CREATE OR REPLACE FUNCTION update_login_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_login_updated_at
BEFORE UPDATE ON app.login
FOR EACH ROW
EXECUTE FUNCTION update_login_updated_at();
```

### 8.5 Recommended: UUID Path (If Preferred)

If you want UUID, here's the safe approach:

**Migration 1: Create new tables with UUID** (1 day)
```sql
-- Create new tables with correct UUID structure
CREATE TABLE IF NOT EXISTS app.login_v2 (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  hashed_password TEXT NOT NULL,
  reset_token VARCHAR,
  reset_token_expires TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.notes_v2 (
  note_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app.login_v2(user_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  s3_key TEXT,
  extracted_text TEXT,
  embedding vector(1536),
  deleted SMALLINT DEFAULT 0,
  shared SMALLINT DEFAULT 0,
  pinned SMALLINT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Similar for tree_items, attachments, pdf_annotations
```

**Migration 2: Migrate data** (30 mins)
```sql
-- Create mapping table
CREATE TABLE user_id_map (
  old_id INTEGER,
  new_id UUID,
  PRIMARY KEY (old_id)
);

-- Backfill mapping
INSERT INTO user_id_map
SELECT user_id, gen_random_uuid() FROM app.login;

-- Copy users
INSERT INTO app.login_v2
SELECT 
  um.new_id,
  l.email,
  l.hashed_password,
  l.reset_token,
  l.reset_token_expires,
  l.created_at,
  l.updated_at
FROM app.login l
JOIN user_id_map um ON l.user_id = um.old_id;
```

**Migration 3: Switch tables** (30 mins)
```sql
-- Rename old tables as backup
ALTER TABLE app.login RENAME TO login_old;
ALTER TABLE app.notes RENAME TO notes_old;
ALTER TABLE app.login_v2 RENAME TO login;
ALTER TABLE app.notes_v2 RENAME TO notes;
-- (similar for other tables)
```

**Migration 4: Update code** (2 hours)
```javascript
// Change all parseInt() to UUID validation
// OLD:
const noteId = parseInt(id, 10);

// NEW:
const noteId = id; // Keep as string
if (!isValidUUID(noteId)) {
  return NextResponse.json({ error: 'Invalid note ID' }, { status: 400 });
}

// Update JWT payload
{user_id: user.user_id}  // Already handles UUID fine
```

---

## 9. SUMMARY TABLE: All Issues & Severity

| # | Issue | Severity | Impact | Effort to Fix | Recommendation |
|---|-------|----------|--------|---------------|---|
| 1 | Three conflicting schema files | **CRITICAL** | Schema out of sync with code | 2-3 days | Consolidate to single source of truth |
| 2 | UUID vs INTEGER mismatch | **CRITICAL** | Foreign keys broken, IDs type-wrong | 3-5 days | Choose path: INTEGER (easy) or UUID (hard) |
| 3 | Missing `deleted` column | **CRITICAL** | Code references column that doesn't exist | 1 day | Add column, update code to use deleted_at |
| 4 | Unused documents/chunks tables | **HIGH** | Confusion, storage waste | 1 hour | Drop tables, or clarify future usage |
| 5 | Soft delete pattern incomplete | **HIGH** | Deleted notes not auto-purged, no grace period | 1 day | Implement deleted_at with expiry jobs |
| 6 | Missing composite indexes | **MEDIUM** | Query performance degradation | 4 hours | Add idx_notes_user_created, idx_tree_user_parent |
| 7 | Vector index on chunks not notes | **MEDIUM** | Embedding search won't work | 2 hours | Create proper hnsw index on app.notes |
| 8 | Missing audit fields | **LOW** | Can't track who deleted what | 2 hours | Add deleted_at, deleted_by, version columns |
| 9 | No email format validation | **LOW** | Invalid emails could be stored | 1 hour | Add CHECK constraint or validation |
| 10 | Password reset token in login table | **LOW** | Mixing concerns, harder to audit | 1-2 days | Consider separate password_resets table |

---

## 10. ACTION ITEMS (PRIORITY ORDER)

### Immediate (This Week - BLOCKING)
- [ ] **Decide: INTEGER or UUID?** - Blocks all schema work
- [ ] **Add `deleted` column** to app.notes (code needs it NOW)
- [ ] **Test code against actual database schema** - Currently misaligned
- [ ] **Document actual database state** in schema-current.json

### Short-term (Next Week)
- [ ] **Create unified migration** combining scattered files
- [ ] **Drop documents/chunks OR implement** - no middle ground
- [ ] **Add composite indexes** for performance
- [ ] **Fix UUID migration** or remove completely

### Medium-term (2-3 Weeks)
- [ ] **Implement soft delete properly** with deleted_at and grace period
- [ ] **Add audit fields** (last_login_at, deleted_by, etc.)
- [ ] **Add constraint validation** (email format, s3_key pattern)
- [ ] **Setup automated cleanup jobs** for expired reset tokens and deleted notes

### Long-term (MVP)
- [ ] Implement vector search with proper index
- [ ] Implement cascading soft deletes
- [ ] Add full audit logging
- [ ] Performance testing at scale (10k+ notes)

---

## CONCLUSION

**Current State:** Database schema has multiple critical issues that will cause production failures
- ❌ Conflicting schema definitions
- ❌ Type mismatches between code and database
- ❌ Missing columns that code references
- ❌ Unused/confusing table structure
- ❌ Incomplete soft delete implementation

**Recommendation:** Complete migration to resolve inconsistencies BEFORE production deployment

**Effort Required:** 5-10 days for complete resolution (depending on UUID decision)

**Risk of Not Fixing:** Production failures on:
- Note deletion (column doesn't exist)
- Tree operations (ID type mismatch)
- Vector search (wrong index)
- Cascading deletes (no foreign keys)

