# Database Schema Specification

**Purpose:** Define all tables, fields, relationships, and constraints for SocsBoard.
**Current Phase:** Events system (Weeks 1-2)
**Future Phases:** Societies, posts, recommendations (documented for planning)

---

## Table Structure

### Core Tables (Week 1)

1. **public.login** - User accounts (already exists)
2. **public.societies** - Society/club information (exists but may need updates)
3. **public.events** - Event listings
4. **public.event_registrations** - Who registered for what events

### Future Tables (Weeks 3+)

5. **public.posts** - Social posts from societies
6. **public.post_interactions** - Likes, ignores on posts
7. **public.followers** - Society followers
8. **public.user_interests** - User-selected interest categories
9. **public.recommendations** - Pre-computed recommendations (cache)

---

## Phase 1: Events System (Weeks 1-2)

### Table: public.login
**Status:** Already exists - verify structure

```sql
CREATE TABLE public.login (
    user_id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    hashed_password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Fields:**
- `user_id` - Unique identifier, auto-increment
- `email` - University email (@universityofgalway.ie), unique constraint
- `hashed_password` - bcrypt hash, never store plain text
- `created_at` - Registration timestamp

**Constraints:**
- UNIQUE(email) - One account per email
- PRIMARY KEY(user_id) - Lookup by user_id

---

### Table: public.societies
**Status:** May need updates - verify exists, add fields if missing

```sql
CREATE TABLE public.societies (
    society_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    logo_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Fields:**
- `society_id` - Unique identifier
- `name` - Society name (Chess Club, Drama Society, etc.)
- `description` - What the society does
- `logo_url` - Logo/banner image URL
- `created_at` - When created
- `updated_at` - Last modification time

**Why:**
- Every event belongs to a society
- Events page shows society info with each event
- Recommendations use society membership

**Future Enhancement (Week 3):**
- Add `follower_count` (denormalized for performance)
- Add `admin_user_id` (who can create events)

---

### Table: public.events
**Status:** Create Week 1

```sql
CREATE TABLE public.events (
    event_id SERIAL PRIMARY KEY,
    society_id INTEGER NOT NULL REFERENCES public.societies(society_id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    event_date DATE NOT NULL,
    event_time TIME,
    location VARCHAR(255),
    capacity INTEGER,
    image_url VARCHAR(500),
    category VARCHAR(100),
    status VARCHAR(50) DEFAULT 'published',
    created_by INTEGER NOT NULL REFERENCES public.login(user_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for fast queries
CREATE INDEX idx_events_society ON public.events(society_id);
CREATE INDEX idx_events_date ON public.events(event_date);
CREATE INDEX idx_events_category ON public.events(category);
CREATE INDEX idx_events_status ON public.events(status);
```

**Fields:**

| Field | Type | Purpose | Constraints |
|-------|------|---------|-------------|
| `event_id` | SERIAL | Unique identifier | PRIMARY KEY |
| `society_id` | INTEGER | Which society created it | NOT NULL, FK societies |
| `title` | VARCHAR(255) | Event name | NOT NULL, searchable |
| `description` | TEXT | Full event details | Optional, up to 5000 chars |
| `event_date` | DATE | When the event happens | NOT NULL, must be future |
| `event_time` | TIME | What time | Optional, format HH:MM |
| `location` | VARCHAR(255) | Where (building, room, etc.) | Optional |
| `capacity` | INTEGER | Max attendees | Optional, NULL = unlimited |
| `image_url` | VARCHAR(500) | Event poster/image | Optional, HTTPS only |
| `category` | VARCHAR(100) | Type (sports, music, tech, arts, games, social, academic, other) | Validate in code |
| `status` | VARCHAR(50) | published, draft, cancelled | Default: published |
| `created_by` | INTEGER | User ID who created | NOT NULL, FK login |
| `created_at` | TIMESTAMP | Creation time | Auto-set |
| `updated_at` | TIMESTAMP | Last modified | Auto-update on PUT |

**Indexes (Performance):**
- `idx_events_society` - Find events by society (homepage, society page)
- `idx_events_date` - Find upcoming events (filter by date range)
- `idx_events_category` - Filter by category (sports, music, etc.)
- `idx_events_status` - Quick "published only" queries

**Why These Fields:**
- `capacity` - Handle venue limits and waitlists
- `status` - Draft events don't show to users
- `created_by` - Check permission to edit/delete
- `event_date + event_time` - User needs both for calendar
- `category` - Recommendations will use this
- Indexes - Without these, filtering 1000+ events is slow

---

### Table: public.event_registrations
**Status:** Create Week 1

```sql
CREATE TABLE public.event_registrations (
    registration_id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES public.events(event_id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES public.login(user_id) ON DELETE CASCADE,
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'registered',
    UNIQUE(event_id, user_id)
);

-- Indexes for fast queries
CREATE INDEX idx_registrations_user ON public.event_registrations(user_id);
CREATE INDEX idx_registrations_event ON public.event_registrations(event_id);
CREATE INDEX idx_registrations_status ON public.event_registrations(status);
```

**Fields:**

| Field | Type | Purpose | Constraints |
|-------|------|---------|-------------|
| `registration_id` | SERIAL | Unique identifier | PRIMARY KEY |
| `event_id` | INTEGER | Which event | NOT NULL, FK events |
| `user_id` | INTEGER | Which user | NOT NULL, FK login |
| `registered_at` | TIMESTAMP | When they registered | Auto-set |
| `status` | VARCHAR(50) | registered, waitlist, cancelled | Default: registered |

**Constraint:**
- `UNIQUE(event_id, user_id)` - One registration per user per event (prevents duplicates)

**Indexes:**
- `idx_registrations_user` - Find all events a user registered for
- `idx_registrations_event` - Find all registrants for an event
- `idx_registrations_status` - Count registered vs waitlist

**Why This Design:**
- Separate table = many-to-many relationship (one user, many events; one event, many users)
- `status` field handles waitlist (when capacity full, new registrations get "waitlist" status)
- `registered_at` lets us show registration order (for waitlist order)
- UNIQUE constraint prevents accidental double-registration

---

## Database Queries (Week 1)

### For GET /api/events (List Events)

```sql
-- Basic list, ordered by date
SELECT
    e.event_id,
    e.title,
    e.event_date,
    e.event_time,
    e.location,
    e.capacity,
    e.category,
    e.image_url,
    s.society_id,
    s.name as society_name,
    COUNT(er.registration_id) as registered_count,
    COALESCE(e.capacity, 999999) - COUNT(er.registration_id) as remaining_capacity
FROM public.events e
JOIN public.societies s ON e.society_id = s.society_id
LEFT JOIN public.event_registrations er ON e.event_id = er.event_id AND er.status = 'registered'
WHERE e.status = 'published' AND e.event_date >= CURRENT_DATE
GROUP BY e.event_id, s.society_id, s.name
ORDER BY e.event_date ASC
LIMIT $1 OFFSET $2;
```

**Why:**
- `LEFT JOIN` for registrations - event has zero registrations = still shows
- `COUNT(er.registration_id)` - How many people registered
- `COALESCE(e.capacity, 999999)` - Handle NULL capacity (unlimited events)
- `WHERE status = 'published'` - Don't show drafts
- `WHERE event_date >= CURRENT_DATE` - Only future events
- `GROUP BY` - Aggregate registrations per event
- `LIMIT/OFFSET` - Pagination

---

### For GET /api/events/:id (Single Event)

```sql
SELECT
    e.event_id,
    e.title,
    e.description,
    e.event_date,
    e.event_time,
    e.location,
    e.capacity,
    e.image_url,
    e.category,
    e.status,
    e.created_by,
    e.created_at,
    s.society_id,
    s.name as society_name,
    COUNT(er.registration_id) as registered_count
FROM public.events e
JOIN public.societies s ON e.society_id = s.society_id
LEFT JOIN public.event_registrations er ON e.event_id = er.event_id AND er.status = 'registered'
WHERE e.event_id = $1 AND e.status = 'published'
GROUP BY e.event_id, s.society_id, s.name;
```

---

### For POST /api/events (Create Event)

```sql
INSERT INTO public.events
(society_id, title, description, event_date, event_time, location, capacity, image_url, category, status, created_by)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
RETURNING event_id, title, created_at;
```

**Parameters:**
- $1 = society_id (from user's society)
- $2 = title
- $3 = description
- $4 = event_date (YYYY-MM-DD)
- $5 = event_time (HH:MM, nullable)
- $6 = location
- $7 = capacity (nullable for unlimited)
- $8 = image_url
- $9 = category
- $10 = status ('published' or 'draft')
- $11 = created_by (from JWT token user_id)

---

### For POST /api/events/:id/register (Register User)

```sql
INSERT INTO public.event_registrations (event_id, user_id, status)
VALUES ($1, $2, CASE
    WHEN $3 >= (SELECT COALESCE(e.capacity, 999999) FROM public.events e WHERE e.event_id = $1)
    THEN 'waitlist'
    ELSE 'registered'
END)
ON CONFLICT (event_id, user_id) DO NOTHING
RETURNING registration_id, status;
```

**Logic:**
- If capacity full → status = 'waitlist'
- If space available → status = 'registered'
- ON CONFLICT DO NOTHING → If already registered, no error

---

### For GET /api/events/:id/registrations (Count Registered)

```sql
SELECT
    COUNT(*) FILTER (WHERE status = 'registered') as registered_count,
    COUNT(*) FILTER (WHERE status = 'waitlist') as waitlist_count
FROM public.event_registrations
WHERE event_id = $1;
```

---

## Data Validation (Application Layer)

**In code, validate:**

### Event Creation (POST /api/events)

```javascript
// title: required, 1-255 chars
if (!title || title.length < 1 || title.length > 255) {
    throw new Error('Title required (1-255 chars)');
}

// event_date: required, must be future date
const eventDate = new Date(body.event_date);
if (eventDate < new Date()) {
    throw new Error('Event date must be in the future');
}

// category: must be one of allowed
const validCategories = ['sports', 'music', 'tech', 'arts', 'games', 'social', 'academic', 'other'];
if (!validCategories.includes(category)) {
    throw new Error(`Category must be one of: ${validCategories.join(', ')}`);
}

// capacity: if provided, must be > 0
if (capacity && capacity <= 0) {
    throw new Error('Capacity must be greater than 0');
}

// image_url: if provided, must be HTTPS
if (image_url && !image_url.startsWith('https://')) {
    throw new Error('Image URL must be HTTPS');
}
```

---

## Future Tables (Reference - Weeks 3+)

### public.posts
```sql
CREATE TABLE public.posts (
    post_id SERIAL PRIMARY KEY,
    society_id INTEGER NOT NULL REFERENCES public.societies(society_id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    image_url VARCHAR(500),
    created_by INTEGER NOT NULL REFERENCES public.login(user_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_posts_society ON public.posts(society_id);
CREATE INDEX idx_posts_created_at ON public.posts(created_at);
```

### public.post_interactions
```sql
CREATE TABLE public.post_interactions (
    interaction_id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES public.posts(post_id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES public.login(user_id) ON DELETE CASCADE,
    interaction_type VARCHAR(50),  -- 'like', 'ignore'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(post_id, user_id, interaction_type)
);
```

### public.followers
```sql
CREATE TABLE public.followers (
    follower_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES public.login(user_id) ON DELETE CASCADE,
    society_id INTEGER NOT NULL REFERENCES public.societies(society_id) ON DELETE CASCADE,
    followed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, society_id)
);
```

---

## Setup Instructions for Person A

1. **Copy all SQL from sections above** (create-tables section)
2. **Run in your PostgreSQL client:**
   ```bash
   psql -U postgres -d socsboard -f schema.sql
   ```
3. **Verify tables created:**
   ```sql
   \dt public.*;  -- List all tables
   \d public.events;  -- Show events table structure
   ```

4. **Write queries** following the examples in "Database Queries" section
5. **Ask Semyon if unclear** (reference this doc, section number)

---

## Performance Notes

**Indexes added because:**
- Events table will have 100s-1000s of rows
- Without indexes, filtering by date/category is O(n) - slow
- With indexes, filtering is O(log n) - fast

**UNIQUE constraint on (event_id, user_id):**
- Prevents accidentally registering twice
- Database enforces, not just application code
- Safer

---

## What's NOT Included Yet

**Week 3+ (don't build yet):**
- User interests/preferences
- Recommendations cache table
- Society admin roles
- Post translations (multilingual support)
- Audit logs

---

## Questions?

1. **"Can I add another field?"** - Yes, ask Semyon first (affects API)
2. **"Should I denormalize X?"** - Ask Semyon (check API_SPECS.md first)
3. **"This query is slow"** - Add an index, ask Semyon

---

**Created:** Feb 5, 2026
**For:** Person A (Database Developer)
**Reference:** PROJECT_PLAN.md Phase 1, API_SPECS.md
