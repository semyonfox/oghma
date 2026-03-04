# PostgreSQL Database Schema

## Connection Details

**Database Type:** PostgreSQL 13+  
**Host:** AWS RDS (oghma.c5uicousc1yo.eu-north-1.rds.amazonaws.com)  
**Port:** 5432  
**Database:** oghma  
**User:** oghma_app  
**SSL Mode:** Required  

```javascript
// Connection string:
postgresql://oghma_app:oghmainthedb@oghma.c5uicousc1yo.eu-north-1.rds.amazonaws.com:5432/oghma?sslmode=require

// Configured in: src/database/pgsql.js
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL);
```

---

## Current Schema

⚠️ **Note:** There's a **schema inconsistency** that needs fixing:
- Schema files define `public.login` and `public.notes`
- Auth code uses `app.login` 
- Password reset verify uses `public.login` (inconsistent!)

### Recommended: Migrate to `app` schema for consistency

---

## Tables & Structure

### 1. **app.login** (Authentication)
**Purpose:** User credentials, JWT sessions  
**Status:** ✅ In use (login, register, password-reset routes)

```sql
CREATE TABLE app.login (
  user_id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  hashed_password TEXT NOT NULL,
  reset_token VARCHAR(64) UNIQUE,
  reset_token_expires TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_login_email ON app.login(email);
```

**Columns:**
| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `user_id` | SERIAL | NO | Auto-increment primary key |
| `email` | TEXT | NO | Unique, used for login |
| `hashed_password` | TEXT | NO | bcryptjs 10 salt rounds |
| `reset_token` | VARCHAR(64) | YES | 32-byte token (hex) for password reset |
| `reset_token_expires` | TIMESTAMPTZ | YES | 1-hour expiry from generation |
| `created_at` | TIMESTAMPTZ | NO | Timestamp of account creation |

**Indexes:**
- `idx_login_email` - For fast email lookups during login

**Used By:**
```javascript
// Register
INSERT INTO app.login (email, hashed_password) VALUES (...)

// Login
SELECT user_id, email, hashed_password FROM app.login WHERE email = $1

// Password reset request
UPDATE app.login SET reset_token = $1, reset_token_expires = $2 WHERE user_id = $3

// Password reset verify
UPDATE app.login SET hashed_password = $1, reset_token = NULL, reset_token_expires = NULL
```

**Sample Data:**
```sql
-- Test user
INSERT INTO app.login (email, hashed_password) VALUES (
  'user@example.com',
  '$2a$10$...' -- bcryptjs hash
);
```

---

### 2. **app.notes** (Study Notes)
**Purpose:** Note metadata, S3 references  
**Status:** ⚠️ Partially implemented (not fully integrated)

```sql
CREATE TABLE app.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INT NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL DEFAULT 'Untitled',
  content TEXT,
  s3_path VARCHAR(512),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  tags TEXT[] DEFAULT '{}',
  shared SMALLINT DEFAULT 0,
  parent_id UUID REFERENCES app.notes(id) ON DELETE SET NULL
);

CREATE INDEX idx_notes_user ON app.notes(user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_notes_title ON app.notes(title) WHERE deleted_at IS NULL;
CREATE INDEX idx_notes_shared ON app.notes(shared) WHERE shared = 1;
CREATE INDEX idx_notes_parent ON app.notes(parent_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_notes_deleted ON app.notes(deleted_at);

CREATE OR REPLACE FUNCTION update_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_notes_timestamp
BEFORE UPDATE ON app.notes
FOR EACH ROW
EXECUTE FUNCTION update_notes_updated_at();
```

**Columns:**
| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | UUID | NO | Primary key, auto-generated |
| `user_id` | INT | NO | Foreign key → app.login(user_id) |
| `title` | VARCHAR(255) | NO | Note title |
| `content` | TEXT | YES | Note content (Markdown) |
| `s3_path` | VARCHAR(512) | YES | S3 reference: `users/{userId}/notes/{noteId}.md` |
| `created_at` | TIMESTAMPTZ | NO | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | NO | Last modified (auto-updated) |
| `deleted_at` | TIMESTAMPTZ | YES | Soft delete (NULL = active) |
| `tags` | TEXT[] | NO | Array of tags |
| `shared` | SMALLINT | NO | 0=PRIVATE, 1=PUBLIC |
| `parent_id` | UUID | YES | For hierarchical organization |

**Indexes:**
- `idx_notes_user` - For user notes listing
- `idx_notes_title` - For title search
- `idx_notes_shared` - For public notes discovery
- `idx_notes_parent` - For nested notes
- `idx_notes_deleted` - For soft delete queries

**Trigger:**
- `update_notes_timestamp` - Auto-updates `updated_at` on every modification

**Sample Data:**
```sql
INSERT INTO app.notes (user_id, title, content, s3_path, tags, shared) VALUES (
  1,
  'Database Design',
  '# PostgreSQL Schema\n\nSchema for authentication and notes...',
  'users/1/notes/550e8400-e29b-41d4-a716-446655440000.md',
  ARRAY['database', 'postgresql', 'schema'],
  0
);
```

---

### 3. **app.files** (File Metadata) - **TO IMPLEMENT**
**Purpose:** Track uploaded files  
**Status:** ❌ UI ready, backend not wired

```sql
-- TODO: Create when implementing S3 uploads
CREATE TABLE app.files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INT NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
  note_id UUID REFERENCES app.notes(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  s3_key VARCHAR(512) NOT NULL UNIQUE,
  file_size INT NOT NULL,
  file_type VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_files_user ON app.files(user_id);
CREATE INDEX idx_files_note ON app.files(note_id);
```

---

### 4. **app.users** (User Profiles) - **TO IMPLEMENT**
**Purpose:** Extended user information  
**Status:** ❌ Planned for later

```sql
-- TODO: Create after basic MVP
CREATE TABLE app.users (
  id SERIAL PRIMARY KEY REFERENCES app.login(user_id) ON DELETE CASCADE,
  avatar_url VARCHAR(512),
  bio TEXT,
  theme VARCHAR(10) DEFAULT 'light',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### 5. **app.note_shares** (Sharing) - **TO IMPLEMENT**
**Purpose:** Note sharing permissions  
**Status:** ❌ Planned for Phase 2

```sql
-- TODO: Create when implementing sharing
CREATE TABLE app.note_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES app.notes(id) ON DELETE CASCADE,
  shared_with INT NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
  permission VARCHAR(10) CHECK (permission IN ('view', 'edit')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(note_id, shared_with)
);

CREATE INDEX idx_shares_note ON app.note_shares(note_id);
CREATE INDEX idx_shares_user ON app.note_shares(shared_with);
```

---

### 6. **app.note_versions** (History) - **TO IMPLEMENT**
**Purpose:** Note version history  
**Status:** ❌ Planned for Phase 2

```sql
-- TODO: Create for version history
CREATE TABLE app.note_versions (
  id BIGSERIAL PRIMARY KEY,
  note_id UUID NOT NULL REFERENCES app.notes(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  version_number INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by INT REFERENCES app.login(user_id)
);

CREATE INDEX idx_versions_note ON app.note_versions(note_id, version_number DESC);
```

---

## Schema Issues & Fixes Needed

### ⚠️ Issue 1: Schema/Code Mismatch

**Current State:**
- Schema file defines: `public.login`, `public.notes`
- Code uses: `app.login`, `app.notes`
- Password reset verify uses: `public.login` (inconsistent!)

**Fix Required:**
```sql
-- OPTION A: Migrate existing to app schema
ALTER TABLE public.login RENAME TO app.login;
ALTER TABLE public.notes RENAME TO app.notes;

-- OPTION B: Recreate in app schema (preferred)
CREATE SCHEMA IF NOT EXISTS app;

-- Move tables to app schema
CREATE TABLE app.login AS SELECT * FROM public.login;
CREATE TABLE app.notes AS SELECT * FROM public.notes;
DROP TABLE public.notes;
DROP TABLE public.login;
```

### ⚠️ Issue 2: Missing Foreign Key Relationship

**Current:**
- `app.notes.user_id` references non-existent `users(id)`

**Fix Required:**
```sql
-- Alter constraint to reference app.login
ALTER TABLE app.notes
DROP CONSTRAINT IF EXISTS notes_user_id_fkey,
ADD CONSTRAINT notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.login(user_id) ON DELETE CASCADE;
```

### ⚠️ Issue 3: Password Reset Using Wrong Table

**Current (Password Reset Verify):**
```javascript
// src/app/api/auth/password-reset/verify/route.js
FROM public.login  // ❌ WRONG - uses public schema
UPDATE public.login

// Should be:
FROM app.login     // ✅ CORRECT
UPDATE app.login
```

**Fix:**
Update `src/app/api/auth/password-reset/verify/route.js` to use `app.login`

---

## Migration Steps

### Step 1: Fix Schema Inconsistencies
```bash
# SSH into RDS or use AWS RDS proxy
psql -h oghma.c5uicousc1yo.eu-north-1.rds.amazonaws.com -U oghma_app -d oghma

-- Execute fixes
CREATE SCHEMA IF NOT EXISTS app;

-- Move login table
ALTER TABLE public.login SET SCHEMA app;

-- Move notes table (if exists)
ALTER TABLE IF EXISTS public.notes SET SCHEMA app;

-- Fix foreign keys
ALTER TABLE app.notes
ADD CONSTRAINT notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.login(user_id) ON DELETE CASCADE;

-- Verify
SELECT * FROM information_schema.tables WHERE table_schema = 'app';
```

### Step 2: Update Code
```bash
# Fix password reset verify route to use app.login instead of public.login
# File: src/app/api/auth/password-reset/verify/route.js
```

### Step 3: Add Missing Tables (Phase 2+)
```sql
-- When ready, create the planned tables:
app.users (user profiles)
app.files (file metadata)
app.note_shares (sharing permissions)
app.note_versions (version history)
```

---

## Connection Examples

### Using postgres.js (Current)
```javascript
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL);

// Query
const user = await sql`
  SELECT user_id, email FROM app.login WHERE email = ${email}
`;

// Insert
const result = await sql`
  INSERT INTO app.login (email, hashed_password) 
  VALUES (${email}, ${hashed})
  RETURNING user_id
`;

// Update
await sql`
  UPDATE app.notes 
  SET title = ${title}, updated_at = NOW()
  WHERE id = ${noteId}
`;
```

### Using Prisma (Future)
```typescript
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Query
const user = await prisma.login.findUnique({
  where: { email },
});

// Insert
const note = await prisma.notes.create({
  data: { userId, title, content },
});

// Update
await prisma.notes.update({
  where: { id },
  data: { title, updated_at: new Date() },
});
```

---

## Backup & Recovery

**Current Backups:**
- RDS automatic backups (35-day retention)
- Manual backup: `backup.sql` (empty - not created yet)

**Create Manual Backup:**
```bash
pg_dump -h oghma.c5uicousc1yo.eu-north-1.rds.amazonaws.com \
  -U oghma_app \
  -d oghma \
  --verbose \
  > backup.sql

# Restore from backup:
psql -h host -U user -d dbname < backup.sql
```

---

## Performance Tuning

### Add Indexes for Common Queries
```sql
-- Already created for app.login
CREATE INDEX idx_login_email ON app.login(email);

-- Already created for app.notes
CREATE INDEX idx_notes_user ON app.notes(user_id, created_at DESC) WHERE deleted_at IS NULL;

-- Additional useful indexes to add:
CREATE INDEX idx_notes_tags ON app.notes USING GIN(tags);
CREATE INDEX idx_notes_content_fts ON app.notes USING GIN(to_tsvector('english', content));
```

### Query Optimization
```sql
-- Add EXPLAIN ANALYZE to understand query performance
EXPLAIN ANALYZE
SELECT * FROM app.notes WHERE user_id = 1 ORDER BY created_at DESC LIMIT 20;

-- Check slow queries
SELECT query, calls, mean_time 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;
```

---

## Next Steps

1. **Immediate (Week 1):**
   - [ ] Fix schema inconsistencies (public → app)
   - [ ] Fix password reset verify route
   - [ ] Test connection from Amplify

2. **Short-term (Weeks 2-4):**
   - [ ] Create `app.files` table for S3 uploads
   - [ ] Create `app.users` table for profiles
   - [ ] Wire up file upload backend

3. **Medium-term (Weeks 5-8):**
   - [ ] Create `app.note_shares` for sharing
   - [ ] Create `app.note_versions` for history
   - [ ] Add full-text search indexes

4. **Long-term (Months 3+):**
   - [ ] Migrate to Prisma ORM
   - [ ] Implement data archival strategy
   - [ ] Add read replicas for scaling

