# Database Design Decisions

**Schema Design, Translation Storage, and Trade-Offs**

This document explains our database architecture choices, focusing on the translation storage strategy and normalization decisions.

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Translation Storage Strategies](#2-translation-storage-strategies)
3. [Hybrid Approach (Events vs Posts)](#3-hybrid-approach-events-vs-posts)
4. [Complete Database Schema](#4-complete-database-schema)
5. [Indexing Strategy](#5-indexing-strategy)
6. [Trade-Offs and Justifications](#6-trade-offs-and-justifications)

---

## 1. Design Philosophy

### Core Principles

1. **Data Integrity First:** Use constraints, foreign keys, transactions
2. **Query Performance:** Index frequently accessed columns
3. **Flexibility for Growth:** Support adding languages without schema changes
4. **Type Safety:** Strong typing where possible, JSONB where flexibility needed
5. **Industry Best Practices:** Follow PostgreSQL conventions

### Requirements

**Multilingual Content:**
- Support Irish (Gaeilge) and English
- Expandable to more languages (French, Spanish, etc.)
- Handle user-provided translations AND auto-translations
- Mark translation quality (manual vs. auto)

**Performance:**
- Fast queries for event listings (< 50ms)
- Efficient search across translations
- Cache-friendly (predictable query patterns)

**Data Integrity:**
- Referential integrity (foreign keys)
- Transactional registrations (prevent overbooking)
- Unique constraints (prevent duplicate registrations)

---

## 2. Translation Storage Strategies

During planning, we explored three approaches for storing multilingual content. This section documents our research and decision-making process.

### Option 1: Columns Per Language (REJECTED)

#### Approach

```sql
CREATE TABLE events (
  id UUID PRIMARY KEY,
  society_id UUID,
  title_en VARCHAR(255),
  title_ga VARCHAR(255),
  description_en TEXT,
  description_ga TEXT,
  location VARCHAR(255),
  event_date TIMESTAMP,
  created_at TIMESTAMP
);
```

#### Pros

**Simple Queries:**
```sql
-- Get English event
SELECT title_en, description_en FROM events WHERE id = '123';

-- Get Irish event
SELECT title_ga, description_ga FROM events WHERE id = '123';
```

**Easy to Understand:** Flat table structure, no JOINs

**Fast for Fixed Languages:** Direct column access (no JSON parsing)

#### Cons

**NOT Scalable:**
```sql
-- Adding French requires ALTER TABLE (risky in production)
ALTER TABLE events
  ADD COLUMN title_fr VARCHAR(255),
  ADD COLUMN description_fr TEXT;
```

**Many NULL Columns:**
- If event only in English: `title_ga`, `description_ga` are NULL
- If event only in Irish: `title_en`, `description_en` are NULL
- Wasted space, sparse table

**Code Duplication:**
```typescript
// Need separate handling for each language
const title = locale === 'en' ? event.title_en :
              locale === 'ga' ? event.title_ga :
              event.title_en; // Fallback
```

**Wide Tables:**
- 10 fields × 3 languages = 30 columns
- Hard to maintain, read, debug

#### Verdict

**REJECTED:** Only suitable for **permanent** 2-language applications where languages **never** change.

**Not for us:** We want expandability (French, Spanish, etc. in future).

---

### Option 2: Separate Translations Table (NORMALIZED)

#### Approach

```sql
CREATE TABLE events (
  id UUID PRIMARY KEY,
  society_id UUID REFERENCES societies(id),
  location VARCHAR(255),
  capacity INT,
  event_date TIMESTAMP,
  status VARCHAR(50) DEFAULT 'published',
  original_language VARCHAR(10) DEFAULT 'en',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE event_translations (
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  language VARCHAR(10) NOT NULL,  -- 'en', 'ga', 'fr', etc.
  title VARCHAR(255) NOT NULL,
  description TEXT,
  slug VARCHAR(255),
  auto_translated BOOLEAN DEFAULT false,
  PRIMARY KEY (event_id, language)
);

CREATE INDEX idx_event_translations_language ON event_translations(language);
CREATE INDEX idx_event_translations_slug ON event_translations(slug);
```

#### Pros

**Clean, Normalized Design:**
- One row per translation (no NULLs)
- Separate concerns (metadata vs. content)
- Easy to audit ("Who translated this? When?")

**Easy to Add Languages:**
```sql
-- Add French translation (just INSERT, no schema change)
INSERT INTO event_translations (event_id, language, title, description)
VALUES ('123', 'fr', 'Atelier Python', 'Apprenez les bases de Python...');
```

**Strong Schema Validation:**
- `title` is NOT NULL (guaranteed)
- `language` is VARCHAR (validated)
- Foreign key constraints (referential integrity)

**Industry Standard:**
- WordPress: `wp_posts` + `wp_postmeta` (similar pattern)
- Drupal: `node` + `node_field_data` (similar pattern)
- Shows professional database design knowledge (resume value)

**Easy to Query Specific Language:**
```sql
-- Get all Irish events
SELECT e.id, et.title, et.description
FROM events e
JOIN event_translations et ON e.id = et.event_id
WHERE et.language = 'ga' AND e.status = 'published';
```

**Audit Trail:**
```sql
-- Add columns for tracking (optional)
ALTER TABLE event_translations
  ADD COLUMN translated_by UUID REFERENCES users(id),
  ADD COLUMN translated_at TIMESTAMP DEFAULT NOW();
```

#### Cons

**Requires JOINs:**
```sql
-- Every query needs JOIN
SELECT e.*, et.title, et.description
FROM events e
JOIN event_translations et ON e.id = et.event_id
WHERE e.id = '123' AND et.language = 'en';
```

**Two Tables to Maintain:**
- Insert event → insert translation(s)
- Update event → update translation(s)
- Delete event → cascade delete translations

**Slightly More Complex Queries:**
```sql
-- Fallback logic (Irish if available, else English)
SELECT
  e.id,
  COALESCE(et_ga.title, et_en.title) AS title,
  COALESCE(et_ga.description, et_en.description) AS description
FROM events e
LEFT JOIN event_translations et_ga ON e.id = et_ga.event_id AND et_ga.language = 'ga'
LEFT JOIN event_translations et_en ON e.id = et_en.event_id AND et_en.language = 'en'
WHERE e.id = '123';
```

#### Query Performance

**Benchmark (1000 events, 2 languages each):**
- Query time: ~10-20ms (with indexes)
- JOIN overhead: ~2-5ms
- **Acceptable for our scale**

#### Verdict

**CHOSEN for Events:** Best for structured content with formal fields.

**Why:**
- Events have strict schema (title, description, slug required)
- Validation important (prevent empty titles)
- Shows professional database design (resume value)

---

### Option 3: JSONB Column (FLEXIBLE)

#### Approach

```sql
CREATE TABLE posts (
  id UUID PRIMARY KEY,
  society_id UUID REFERENCES societies(id),
  user_id UUID REFERENCES users(id),
  translations JSONB NOT NULL,  -- All languages in one column
  image_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- GIN index for JSONB queries (IMPORTANT for performance)
CREATE INDEX idx_posts_translations ON posts USING GIN (translations);
```

#### JSONB Structure

```json
{
  "en": {
    "content": "Check out our trip to Galway! ",
    "autoTranslated": false
  },
  "ga": {
    "content": "Féach ar ár dturas go Gaillimh! ",
    "autoTranslated": true
  }
}
```

#### Pros

**No JOINs Needed:**
```sql
-- Get Irish post (single query, no JOIN)
SELECT
  id,
  translations->'ga'->>'content' AS content,
  translations->'ga'->>'autoTranslated' AS auto_translated
FROM posts
WHERE id = '123';
```

**Very Flexible:**
```sql
-- Add metadata without schema change
UPDATE posts SET translations = jsonb_set(
  translations,
  '{en,translatedBy}',
  '"user-456"'
) WHERE id = '123';
```

**Fast with GIN Indexes:**
```sql
-- Check if Irish translation exists (indexed!)
SELECT id FROM posts WHERE translations ? 'ga';

-- Search in Irish content (full-text search)
SELECT id FROM posts
WHERE translations->'ga'->>'content' ILIKE '%Gaillimh%';
```

**Single Row Per Post:**
- Easier to reason about (one post = one row)
- No orphaned translations (impossible)

**Modern PostgreSQL Feature:**
- Shows advanced database knowledge (resume value)
- JSONB is PostgreSQL's strength (not MySQL)

**Easy Metadata Addition:**
```json
{
  "en": {
    "content": "...",
    "autoTranslated": false,
    "translatedBy": "user-123",
    "translatedAt": "2025-11-24T10:00:00Z",
    "qualityScore": 0.95
  }
}
```

#### Cons

**PostgreSQL-Specific:**
- Cannot easily switch to MySQL (no JSONB support)
- Vendor lock-in (but PostgreSQL unlikely to disappear)

**Less Schema Validation:**
```sql
-- Database won't prevent this:
INSERT INTO posts (translations) VALUES ('{"en": {"wrong_field": "oops"}}');
```

**Mitigation:** Application-level validation (TypeScript types, `zod` schemas)

**Requires GIN Indexes for Performance:**
```sql
-- Without GIN index, JSONB queries are SLOW (table scan)
CREATE INDEX idx_posts_translations ON posts USING GIN (translations);
```

**Slightly More Complex Validation:**
```typescript
// Application code must validate JSONB structure
const postSchema = z.object({
  translations: z.record(z.object({
    content: z.string().max(500),
    autoTranslated: z.boolean(),
  })),
});
```

#### Query Performance

**Benchmark (1000 posts, JSONB with GIN index):**
- Simple query: ~5-10ms
- JSON path access: ~8-15ms
- Existence check (`? 'ga'`): ~3-5ms
- **Comparable to normalized tables**

#### Verdict

**CHOSEN for Posts:** Best for flexible, casual content.

**Why:**
- Posts are informal (memes, photos, announcements)
- Structure may vary (some posts long, some short, some with images)
- Easy to add metadata (translation quality scores, reviewer info)
- Shows modern PostgreSQL skills (resume value)

---

## 3. Hybrid Approach (Events vs Posts)

### Final Decision: Use Both Strategies

**Why Different Strategies?**

1. **Events are Formal, Structured**
   - Fixed schema (title, description, date, location required)
   - Validation critical (prevent empty events)
   - Normalized table = stronger guarantees

2. **Posts are Casual, Flexible**
   - Variable content (short meme vs. long announcement)
   - Metadata changes often (add quality scores, reviewer notes)
   - JSONB = easier to evolve

### Comparison

| Aspect | Events (Normalized) | Posts (JSONB) |
|--------|---------------------|---------------|
| **Schema** | Strict (separate table) | Flexible (JSONB column) |
| **Validation** | Database-enforced | Application-enforced |
| **Query Pattern** | JOIN required | Single table |
| **Performance** | ~10-20ms | ~8-15ms |
| **Expandability** | Good (add languages easily) | Excellent (no schema change) |
| **Resume Value** | Shows normalization skills | Shows modern PostgreSQL skills |

### Implementation

```sql
-- EVENTS: Normalized (separate translations table)
CREATE TABLE events (...);
CREATE TABLE event_translations (...);

-- POSTS: JSONB (translations in one column)
CREATE TABLE posts (
  id UUID PRIMARY KEY,
  translations JSONB NOT NULL
);
```

### Benefits of Hybrid Approach

1. **Demonstrates Architectural Decision-Making**
   - "Why did you use two different approaches?"
   - "Events need validation, posts need flexibility"
   - Shows thoughtful design (resume value)

2. **Right Tool for the Job**
   - Not dogmatic ("always normalize" or "always use JSONB")
   - Pragmatic engineering

3. **Learning Opportunity**
   - Team experiences both approaches
   - Can compare trade-offs firsthand

---

## 4. Complete Database Schema

### Core Tables

```sql
-- Users & Authentication
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  student_id VARCHAR(50) UNIQUE,
  avatar_url TEXT,
  preferred_locale VARCHAR(10) DEFAULT 'en',
  role VARCHAR(50) DEFAULT 'student',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_student_id ON users(student_id);

-- University Student Data (synced via API)
CREATE TABLE student_data (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  courses JSONB,  -- [{code: "CT216", name: "Software Eng I"}, ...]
  department VARCHAR(255),
  year INTEGER,
  societies JSONB,  -- From university API
  synced_at TIMESTAMP DEFAULT NOW()
);

-- Societies
CREATE TABLE societies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  avatar_url TEXT,
  banner_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_societies_name ON societies(name);

-- Society Memberships & Roles
CREATE TABLE society_members (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  society_id UUID REFERENCES societies(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'member',  -- member, admin, moderator, follower
  joined_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, society_id)
);

CREATE INDEX idx_society_members_user ON society_members(user_id);
CREATE INDEX idx_society_members_society ON society_members(society_id);

-- Events (metadata, language-agnostic)
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id UUID REFERENCES societies(id) ON DELETE CASCADE,
  location VARCHAR(255),
  capacity INTEGER,
  event_date TIMESTAMP NOT NULL,
  status VARCHAR(50) DEFAULT 'published',
  original_language VARCHAR(10) DEFAULT 'en',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_events_society ON events(society_id);
CREATE INDEX idx_events_date ON events(event_date);
CREATE INDEX idx_events_status ON events(status);

-- Event Translations (normalized approach)
CREATE TABLE event_translations (
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  language VARCHAR(10) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  slug VARCHAR(255),
  auto_translated BOOLEAN DEFAULT false,
  PRIMARY KEY (event_id, language)
);

CREATE INDEX idx_event_translations_language ON event_translations(language);
CREATE INDEX idx_event_translations_slug ON event_translations(slug);

-- Posts (JSONB approach)
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id UUID REFERENCES societies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  translations JSONB NOT NULL,
  image_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_posts_society ON posts(society_id);
CREATE INDEX idx_posts_created ON posts(created_at DESC);
CREATE INDEX idx_posts_translations ON posts USING GIN (translations);

-- Event Registrations
CREATE TABLE registrations (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'registered',  -- registered, attended, cancelled, waitlist
  registered_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, event_id)
);

CREATE INDEX idx_registrations_user ON registrations(user_id);
CREATE INDEX idx_registrations_event ON registrations(event_id);

-- User Interactions (likes, ignores, interests)
CREATE TABLE interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content_type VARCHAR(50) NOT NULL,  -- 'event' or 'post'
  content_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL,  -- 'like', 'interested', 'ignore'
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, content_type, content_id, action)
);

CREATE INDEX idx_interactions_user ON interactions(user_id);
CREATE INDEX idx_interactions_content ON interactions(content_type, content_id);

-- Recommendations (pre-computed)
CREATE TABLE recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content_type VARCHAR(50) NOT NULL,
  content_id UUID NOT NULL,
  score FLOAT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, content_type, content_id)
);

CREATE INDEX idx_recommendations_user_score ON recommendations(user_id, score DESC);

-- User Interests
CREATE TABLE user_interests (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  interest VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, interest)
);

CREATE INDEX idx_user_interests_user ON user_interests(user_id);
```

---

## 5. Indexing Strategy

### Why Indexes Matter

**Without Index:**
```sql
SELECT * FROM events WHERE society_id = '123';
-- Sequential scan: O(n) - checks every row
-- 10,000 events × 10ms = 100 seconds 
```

**With Index:**
```sql
CREATE INDEX idx_events_society ON events(society_id);
SELECT * FROM events WHERE society_id = '123';
-- Index scan: O(log n) - binary search
-- log₂(10,000) × 1ms = 14ms 
```

### Our Indexes

| Table | Index | Purpose |
|-------|-------|---------|
| `users` | `idx_users_email` | Fast login lookup |
| `users` | `idx_users_student_id` | Student ID verification |
| `events` | `idx_events_society` | Filter by society |
| `events` | `idx_events_date` | Upcoming events query |
| `events` | `idx_events_status` | Published events filter |
| `event_translations` | `idx_event_translations_language` | Language filtering |
| `event_translations` | `idx_event_translations_slug` | SEO-friendly URLs |
| `posts` | `idx_posts_translations` (GIN) | JSONB queries |
| `registrations` | `idx_registrations_user` | User's events |
| `registrations` | `idx_registrations_event` | Event attendees |
| `recommendations` | `idx_recommendations_user_score` | Top recommendations |

### Index Trade-Offs

**Pros:**
- Faster queries (10-100x speedup)
- Better user experience (page load < 2s)

**Cons:**
- Slower writes (index must update)
- More disk space (~20% overhead)

**Our Verdict:** Worth it (reads >> writes for our app).

---

## 6. Trade-Offs and Justifications

### Decision Matrix

| Criterion | Normalized (Events) | JSONB (Posts) | Decision |
|-----------|---------------------|---------------|----------|
| **Schema Validation** | Strong (DB-enforced) | Weak (app-level) | Normalized for events |
| **Flexibility** | Good (add languages) | Excellent (any structure) | JSONB for posts |
| **Query Complexity** | Medium (JOINs) | Low (single table) | JSONB wins here |
| **Performance** | ~10-20ms | ~8-15ms | Similar (both fast) |
| **Resume Value** | Shows normalization | Shows modern PostgreSQL | Both valuable |

### When to Use Each Approach

**Use Normalized Tables (Separate Translations) When:**
- Content has **strict schema** (required fields)
- **Validation critical** (prevent bad data)
- **Audit trail needed** (who translated? when?)
- Content is **formal** (legal, academic, official)

**Use JSONB When:**
- Content **structure varies** (some posts short, some long)
- **Metadata changes often** (add fields without schema change)
- Content is **casual** (social posts, user comments)
- Want **single row per item** (simpler mental model)

### PostgreSQL-Specific Benefits

**Why PostgreSQL is Ideal for Our Hybrid Approach:**

1. **JSONB Support:** Best-in-class JSON handling (not just MySQL's JSON)
2. **GIN Indexes:** Fast JSONB queries (unique to PostgreSQL)
3. **ACID + JSONB:** Relational integrity + flexible schema (best of both worlds)
4. **Community:** Large, active community, great documentation

---

## Conclusion

**Our Hybrid Approach:**
- **Events:** Normalized (separate `event_translations` table)
- **Posts:** JSONB (`translations` column)

**Why This Works:**
- Right tool for the job (not dogmatic)
- Demonstrates architectural decision-making (resume value)
- Team learns both approaches (valuable experience)
- Scalable (add languages without pain)

**Key Takeaway:**
> "Database design is about trade-offs. We chose different strategies for events vs. posts based on their specific requirements, not a one-size-fits-all approach."

---

**Related Documents:**
- [02_TECHNOLOGY_DECISIONS.md](./02_TECHNOLOGY_DECISIONS.md) - Why we chose PostgreSQL
- [ARCHITECTURE_AND_TECH_STACK.md](./ARCHITECTURE_AND_TECH_STACK.md) - System architecture
- [SOFTWARE_REQUIREMENTS_SPECIFICATION.md](./SOFTWARE_REQUIREMENTS_SPECIFICATION.md) - Database schema details (Appendix A)

---

**Last Updated:** November 24, 2025
**Author:** Development Team
**Maintained By:** Semyon (Project Manager)
