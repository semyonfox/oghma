# Database Schema

Quick reference for the database tables. Everything uses UUID v7.

## Tables

### app.login - Users

```sql
CREATE TABLE app.login (
  user_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  hashed_password text NOT NULL,
  created_at timestamp with time zone DEFAULT NOW(),
  last_login_at timestamp with time zone,
  is_active smallint DEFAULT 1
);
```

### app.notes - The actual notes

```sql
CREATE TABLE app.notes (
  note_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
  title text NOT NULL,
  content text,
  created_at timestamp with time zone DEFAULT NOW(),
  updated_at timestamp with time zone DEFAULT NOW(),
  deleted smallint DEFAULT 0,
  deleted_at timestamp with time zone,
  shared smallint DEFAULT 0,
  pinned smallint DEFAULT 0
);
```

Soft delete enabled - notes aren't truly deleted until 7 days pass.

### app.documents - Uploaded files (PDFs, etc)

```sql
CREATE TABLE app.documents (
  document_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
  note_id uuid REFERENCES app.notes(note_id) ON DELETE CASCADE,
  filename text NOT NULL,
  s3_key text NOT NULL,
  file_size bigint,
  created_at timestamp with time zone DEFAULT NOW(),
  deleted smallint DEFAULT 0
);
```

### app.chunks - Embeddings for semantic search

```sql
CREATE TABLE app.chunks (
  chunk_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
  note_id uuid REFERENCES app.notes(note_id) ON DELETE CASCADE,
  text text NOT NULL,
  embedding vector(1536) NOT NULL,
  created_at timestamp with time zone DEFAULT NOW()
);
```

1536 dimensions (OpenAI text-embedding-3-small). Uses HNSW index for similarity search.

### app.tree_items - Folder hierarchy

```sql
CREATE TABLE app.tree_items (
  id SERIAL PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app.login(user_id) ON DELETE CASCADE,
  note_id uuid NOT NULL REFERENCES app.notes(note_id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES app.tree_items(id) ON DELETE CASCADE,
  position smallint,
  created_at timestamp with time zone DEFAULT NOW()
);
```

Note: uses SERIAL (integer) for parent_id, not UUID. This is a historical quirk.