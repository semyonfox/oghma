# Technology Stack Decisions

**Why We Chose Next.js, PostgreSQL, Redis, and More**

This document explains the rationale behind every major technology choice in our stack. Each decision considers multiple alternatives and provides clear justification.

---

## Table of Contents

1. [Decision Framework](#1-decision-framework)
2. [Frontend Framework](#2-frontend-framework-nextjs--react)
3. [Database](#3-database-postgresql)
4. [Database Access Layer](#4-database-access-layer-pg-with-optional-prisma)
5. [Caching Layer](#5-caching-layer-redis)
6. [UI Framework](#6-ui-framework-bootstrap-5)
7. [Language](#7-language-typescript)
8. [Authentication](#8-authentication-oauth--jwt)
9. [Internationalization](#9-internationalization-next-intl)
10. [Deployment](#10-deployment-docker--aws)
11. [CI/CD](#11-cicd-github-actions)
12. [Translation API](#12-translation-api-deepl)

---

## 1. Decision Framework

For each technology choice, we evaluated:

### Criteria

1. **Learning Curve:** Can team learn it in 2 weeks?
2. **Project Fit:** Does it solve our specific problems?
3. **Industry Relevance:** Will it help with job applications?
4. **Documentation:** Is there good documentation and community support?
5. **Timeline:** Can we ship in 8 weeks with this tech?
6. **Team Capacity:** Do we have or can we acquire the skills?
7. **Cost:** Is it free or affordable for students?

### Process

1. Research 3-5 alternatives
2. Build proof-of-concept with top 2 choices
3. Compare using criteria matrix
4. Make decision as team (consensus or vote)
5. Document rationale for future reference

---

## 2. Frontend Framework: Next.js + React

### The Decision

**Chosen:** Next.js 14+ (App Router) with React 18

### Alternatives Considered

| Framework | Pros | Cons | Decision |
|-----------|------|------|----------|
| **Next.js** | SSR/CSR hybrid, API routes, great DX, industry-standard | Learning curve (App Router new) | [x] **CHOSEN** |
| **Create React App** | Simple, familiar | No SSR, separate backend needed, deprecated | [ ] Rejected |
| **Remix** | Modern, fast | Smaller community, less mature | [ ] Too new |
| **Vue + Nuxt** | Easier learning curve | Less industry demand than React | [ ] React more valuable |
| **SvelteKit** | Fastest, simplest | Tiny community, risky for jobs | [ ] Too niche |
| **Vanilla JS** | No framework overhead | Reinventing wheel, slow development | [ ] Not practical |

### Why Next.js?

#### 1. **Full-Stack in One Framework**

```
Traditional Approach:
Frontend (React) ← fetch → Backend (Express.js) ← query → Database
  (Port 3000)                 (Port 5000)

Next.js Approach:
Frontend + Backend (Next.js) ← query → Database
  (Port 3000)
  ├── /app/[locale]/page.tsx  (Frontend)
  └── /app/api/events/route.ts  (Backend API)
```

**Benefits:**
- No CORS issues (same origin)
- Shared types (TypeScript across frontend + backend)
- Single deployment (not 2 separate apps)
- Faster development (no context switching)

#### 2. **SSR/CSR Hybrid (Best of Both Worlds)**

**Server-Side Rendering (SSR):**
- Fast initial page load
- SEO-friendly (Google indexes content)
- Good for public pages (landing, event listings)

**Client-Side Rendering (CSR):**
- Interactive dashboards
- Real-time updates (likes, registrations)
- Good for authenticated pages

**Next.js Lets Us Choose:**
```typescript
// Server Component (SSR) - runs on server
export default async function EventsPage() {
  const events = await prisma.event.findMany();  // Direct DB access
  return <div>{events.map(e => <EventCard event={e} />)}</div>;
}

// Client Component (CSR) - runs in browser
'use client';
export default function LikeButton() {
  const [liked, setLiked] = useState(false);
  return <button onClick={() => setLiked(!liked)}>Like</button>;
}
```

#### 3. **API Routes (Built-In Backend)**

```typescript
// app/api/events/route.ts
export async function GET(request: Request) {
  const events = await prisma.event.findMany();
  return Response.json(events);
}

export async function POST(request: Request) {
  const body = await request.json();
  const event = await prisma.event.create({ data: body });
  return Response.json(event, { status: 201 });
}
```

**No Express.js needed!**

#### 4. **Industry Demand**

**Job Postings (Nov 2025):**
- Next.js: 15,000+ jobs (Indeed.com, "Next.js developer")
- React: 80,000+ jobs
- Vue: 8,000+ jobs
- Svelte: 1,500+ jobs

**Result:** React + Next.js = maximum job opportunities.

#### 5. **Great Developer Experience (DX)**

- Hot reload (code changes update instantly)
- TypeScript integration (built-in)
- File-based routing (`/app/events/page.tsx` → `/events`)
- Automatic code splitting (fast page loads)
- Built-in image optimization
- Great error messages

### Trade-Offs Accepted

**Learning Curve:**
- Next.js 14 App Router is new (released 2023)
- Different from older Pages Router (tutorials may be outdated)
- Server Components new concept

**Mitigation:**
- Spent Week 1 learning App Router
- Stuck to official Next.js documentation
- Team paired on first features

**Vendor Lock-In:**
- Next.js is primarily developed by Vercel (company)
- But: Open-source, large community, unlikely to disappear

**Decision:** Benefits outweigh learning curve.

---

## 3. Database: PostgreSQL

### The Decision

**Chosen:** PostgreSQL 15+

### Alternatives Considered

| Database | Pros | Cons | Decision |
|----------|------|------|----------|
| **PostgreSQL** | JSONB support, ACID, robust, industry-standard | More complex than MySQL | [x] **CHOSEN** |
| **MySQL** | Simple, familiar | No JSONB, less flexible | [ ] Need JSONB for translations |
| **MongoDB** | Flexible schema, easy to start | No relational integrity, overkill | [ ] Need relations (users ↔ events) |
| **SQLite** | No setup, embedded | Single file, not scalable | [ ] Not production-ready |
| **Supabase** | Managed PostgreSQL, real-time | Vendor lock-in, learning curve | [ ] Want full control |

### Why PostgreSQL?

#### 1. **JSONB Support (Critical for Translations)**

**Our Requirement:** Store multilingual content flexibly.

**PostgreSQL JSONB:**
```sql
CREATE TABLE posts (
  id UUID PRIMARY KEY,
  translations JSONB NOT NULL  -- {en: {...}, ga: {...}}
);

-- Query Irish posts
SELECT id, translations->'ga'->>'content' as content
FROM posts
WHERE translations ? 'ga';  -- Check if Irish translation exists

-- Index for fast queries
CREATE INDEX idx_posts_translations ON posts USING GIN (translations);
```

**Why Not MySQL?**
- MySQL JSON support is limited (no `? ` operator, slower queries)
- No GIN indexes (PostgreSQL's specialized JSONB index)

#### 2. **ACID Compliance (Data Integrity)**

**Our Requirement:** Event registrations must be transactional.

**Scenario:**
```typescript
// Race condition: 2 students register for last spot
// Without transaction: Both succeed, capacity exceeded!

// With PostgreSQL transaction:
await prisma.$transaction(async (tx) => {
  const event = await tx.event.findUnique({ where: { id } });
  if (event.registrations.length >= event.capacity) {
    throw new Error('Event full');
  }
  await tx.registration.create({ data: { userId, eventId: id } });
});
// [x] Only one registration succeeds, other gets error
```

**Why Not MongoDB?**
- MongoDB transactions are limited (single-document default)
- Multi-document transactions expensive, not default behavior

#### 3. **Relational Data (Users ↔ Events ↔ Societies)**

**Our Data Model:**
```
users ←→ society_members ←→ societies
  ↓                              ↓
registrations                  events
  ↓
interactions
```

**Relationships:**
- User belongs to many societies (many-to-many)
- Event belongs to one society (one-to-many)
- User registers for many events (many-to-many)

**Relational database is natural fit.**

**Why Not MongoDB?**
- MongoDB requires manual denormalization or complex `$lookup` queries
- No foreign key constraints (data integrity risk)

#### 4. **Industry Standard**

**Usage in Production:**
- Instagram: PostgreSQL (1 billion+ users)
- Spotify: PostgreSQL (metadata, user data)
- Reddit: PostgreSQL (comments, posts)

**Job Market:**
- PostgreSQL: 60,000+ job postings
- MySQL: 50,000+
- MongoDB: 25,000+

**Result:** PostgreSQL skills transfer to most companies.

#### 5. **Advanced Features We Might Use**

- **Full-Text Search:** Event search by keywords (built-in, no Elasticsearch needed)
- **Indexes:** B-tree, Hash, GIN, GiST for fast queries
- **Views:** Materialized views for analytics dashboard
- **Stored Procedures:** Complex recommendation queries
- **Partitioning:** Archive old events (if database grows large)

### Trade-Offs Accepted

**Complexity:**
- More configuration than SQLite
- Need to understand indexes, queries, transactions

**Mitigation:**
- Use PostgreSQL from Week 1 (get comfortable early)
- Semyon (PM) has PostgreSQL experience
- Good documentation and tutorials available

**Decision:** Complexity worth it for JSONB + relational power.

---

## 4. Database Access Layer: pg (with Optional Prisma)

### The Decision

**Chosen:** `postgres` npm package (native driver) with optional Prisma for simple queries

### Alternatives Considered

| ORM/Driver | Pros | Cons | Decision |
|------------|------|------|----------|
| **pg (node-postgres)** | Full SQL control, lightweight, industry-standard | Manual type definitions, more boilerplate | [x] **PRIMARY** |
| **Prisma** | Type-safe, auto-generated types, easy migrations | Less control over complex queries, abstraction layer | [x] **OPTIONAL** (for simple CRUD) |
| **Drizzle ORM** | Type-safe, SQL-like, modern | New, smaller community | [ ] Too new (risky) |
| **TypeORM** | Mature, feature-rich | Heavy, complex, opinionated | [ ] Overkill for our needs |
| **Sequelize** | Popular, many features | Older API, less type-safe | [ ] Prisma better for type safety |
| **Knex.js** | SQL builder, flexible | No type safety, manual types | [ ] pg better for raw SQL |

### Why `pg` (node-postgres)?

#### 1. **Full Control Over SQL**

**Complex Recommendation Query:**
```typescript
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL);

// Recommendation algorithm with complex joins and scoring
const recommendations = await sql`
  SELECT
    e.id,
    e.title,
    (
      -- Society membership score
      CASE WHEN sm.user_id IS NOT NULL THEN 50 ELSE 0 END +
      -- Past attendance score
      (SELECT COUNT(*) * 10 FROM interactions i
       WHERE i.user_id = ${userId} AND i.action = 'attend' LIMIT 3) +
      -- Trending score
      CASE WHEN COUNT(r.user_id) > 20 THEN 10 ELSE 0 END
    ) AS score
  FROM events e
  LEFT JOIN societies s ON e.society_id = s.id
  LEFT JOIN society_members sm ON s.id = sm.society_id AND sm.user_id = ${userId}
  LEFT JOIN registrations r ON e.id = r.event_id
  WHERE e.event_date > NOW()
  GROUP BY e.id, sm.user_id
  ORDER BY score DESC
  LIMIT 20;
`;
```

**Prisma Limitation:**
- Cannot express complex scoring in Prisma's query builder
- Would need raw SQL anyway: `prisma.$queryRaw`

#### 2. **Industry Recognition**

**Job Interviews:**
- "Do you know SQL?" ← Universal question
- Showing raw SQL skills more valuable than ORM-specific knowledge

**pg Package:**
- 20+ years old, battle-tested
- Used by massive companies (Uber, Netflix)
- Direct PostgreSQL driver (no abstraction layer overhead)

#### 3. **Performance**

**Benchmark (Simple SELECT):**
- pg: ~1-2ms query time
- Prisma: ~3-5ms (extra layer, query building)

**For Recommendations (1000s of queries/minute):**
- Every millisecond matters
- Direct SQL = faster

#### 4. **Lightweight**

**Bundle Size:**
- pg: ~200KB
- Prisma Client: ~2MB (10x larger)

**Startup Time:**
- pg: Instant
- Prisma: ~500ms (generates client on first run)

### Why Optional Prisma?

**Use Prisma For:** Simple CRUD operations where type safety is valuable.

```typescript
// CREATE - Prisma is clean
const user = await prisma.user.create({
  data: {
    email: 'john@example.com',
    name: 'John Doe',
  },
});

// READ - Type-safe, autocomplete works
const events = await prisma.event.findMany({
  where: { status: 'published' },
  include: { society: true },  // Type-safe joins
});
```

**Use pg For:** Complex queries, recommendations, analytics.

```typescript
// Complex query with custom scoring
const results = await sql`
  SELECT ... (complex SQL with CTEs, window functions, etc.)
`;
```

### Hybrid Approach (Best of Both Worlds)

**Decision:**
- **80% pg:** Direct SQL for control and performance
- **20% Prisma:** Simple CRUD for convenience

**Project Structure:**
```
/lib/
  ├── db.ts          # pg connection
  ├── prisma.ts      # Prisma client (optional)
  └── queries/
      ├── events.ts  # pg for complex event queries
      └── users.ts   # Prisma for simple user CRUD
```

### Trade-Offs Accepted

**No Auto-Generated Types (with pg):**
- Must manually define TypeScript types
- Risk of type mismatch with database

**Mitigation:**
- Generate types from Prisma schema (even if not using Prisma for queries)
- Use `zod` for runtime validation

**Example:**
```typescript
// Generated from Prisma schema
type Event = {
  id: string;
  title: string;
  eventDate: Date;
  societyId: string;
};

// Use in pg query
const events = await sql<Event[]>`SELECT * FROM events`;
```

**Decision:** Manual types are acceptable for control and performance.

---

## 5. Caching Layer: Redis

### The Decision

**Chosen:** Redis 7+ (with Valkey as fallback)

### Alternatives Considered

| Cache | Pros | Cons | Decision |
|-------|------|------|----------|
| **Redis** | Industry-standard, fast, rich data types | Licensing changes (2024) | [x] **CHOSEN** |
| **Valkey** | Open-source Redis fork, identical API | New (2024), less mature | [x] **FALLBACK** |
| **Memcached** | Simple, fast | No data structures, no persistence | [ ] Redis more powerful |
| **In-Memory Cache (Node)** | No setup needed | Not shared across instances, limited | [ ] Need shared cache for scaling |
| **PostgreSQL (as cache)** | No extra service | Slow compared to in-memory | [ ] Defeats purpose of caching |

### Why Redis?

#### 1. **Speed**

**Benchmark:**
- PostgreSQL query: ~10-50ms
- Redis cache hit: ~1-2ms (10-50x faster)

**Impact on User Experience:**
```
Without Redis:
Page load: 500ms (5 database queries × 100ms each)

With Redis:
Page load: 100ms (5 cache hits × 1ms each + 90ms rendering)
```

**Result:** 80% faster page loads.

#### 2. **Data Structures (Not Just Key-Value)**

**Redis Supports:**
- **Strings:** Session tokens, simple cache
- **Hashes:** User profiles, event details
- **Lists:** Recent posts, activity feeds
- **Sets:** Unique visitors, attendee lists
- **Sorted Sets:** Leaderboards, trending events (sorted by score)

**Our Use Cases:**
```typescript
// Sorted Set for trending events
await redis.zadd('trending:events', score, eventId);
const top10 = await redis.zrange('trending:events', 0, 9, 'REV');

// Hash for user session
await redis.hset(`session:${sessionId}`, {
  userId: '123',
  email: 'user@example.com',
  expiresAt: Date.now() + 86400000,
});
```

**Why Not Memcached?**
- Only supports simple key-value
- No sorted sets (needed for trending)

#### 3. **TTL (Time-To-Live) Built-In**

**Auto-Expiration:**
```typescript
// Cache for 1 hour, auto-deletes after
await redis.setEx(`event:${id}`, 3600, JSON.stringify(event));

// No need for manual cleanup!
```

**Why Important:**
- Stale data automatically removed
- No manual cache invalidation logic

#### 4. **Session Storage**

**JWT Tokens Stored in Redis:**
```typescript
// Store session (24-hour expiration)
await redis.setEx(`session:${sessionId}`, 86400, JSON.stringify({
  userId,
  email,
  role,
}));

// Fast session lookup on every request (middleware)
const session = await redis.get(`session:${sessionId}`);
if (!session) {
  return Response.redirect('/login');
}
```

**Why Not PostgreSQL for Sessions?**
- Database query too slow (50ms vs. 1ms)
- Every page load checks session (100s of queries/second)

#### 5. **Recommendation Pre-Computation**

**Batch Job (Cron) → Store in Redis:**
```typescript
// Compute recommendations (expensive, 10 seconds)
const recommendations = await computeRecommendations(userId);

// Cache for 1 hour (cheap, 1ms)
await redis.setEx(
  `recommendations:${userId}`,
  3600,
  JSON.stringify(recommendations)
);

// User requests dashboard → instant load (1ms cache hit)
const cached = await redis.get(`recommendations:${userId}`);
return JSON.parse(cached);
```

**Without Redis:**
- Compute on every request (10 seconds per user)
- 100 users = 1000 seconds total
- Unusable

**With Redis:**
- Compute once (batch job, off-peak)
- Serve from cache (1ms per user)
- Scalable

### Why Valkey as Fallback?

**Redis Licensing Issue (2024):**
- Redis Labs changed license to SSPL (not open-source)
- Enterprise features now proprietary

**Valkey:**
- Linux Foundation fork of Redis (before license change)
- 100% compatible API (drop-in replacement)
- Fully open-source (BSD license)

**Decision:**
- Use Redis now (stable, mature)
- Switch to Valkey if needed (no code changes)

### Trade-Offs Accepted

**Additional Service:**
- Need to run Redis server (more complexity)
- More memory usage (in-memory cache)

**Mitigation:**
- Docker Compose makes setup easy (`docker-compose up`)
- Redis memory-efficient (compression, eviction policies)

**Cache Invalidation:**
- "Two hard problems in CS: naming, cache invalidation, off-by-one errors"
- Need logic to clear stale cache

**Mitigation:**
- Clear cache on writes:
  ```typescript
  // Update event → invalidate cache
  await prisma.event.update({ where: { id }, data: { title } });
  await redis.del(`event:${id}`);
  ```

**Decision:** Speed benefits outweigh complexity.

---

## 6. UI Framework: Bootstrap 5

### The Decision

**Chosen:** Bootstrap 5.3

### Alternatives Considered

| Framework | Pros | Cons | Decision |
|-----------|------|------|----------|
| **Bootstrap** | Fast prototyping, familiar, responsive grid | "Bootstrap look" (generic) | [x] **CHOSEN** |
| **Tailwind CSS** | Utility-first, customizable, modern | Verbose HTML, learning curve | [ ] Too slow for 8 weeks |
| **Material UI** | Polished, React components | Heavy, opinionated design | [ ] Overkill |
| **Chakra UI** | Modern, accessible | Smaller community | [ ] Bootstrap more familiar |
| **Custom CSS** | Full control, unique design | Reinventing wheel, slow | [ ] Not enough time |

### Why Bootstrap?

#### 1. **Fast Prototyping**

**5-Minute Responsive Card:**
```html
<div class="card">
  <img src="event.jpg" class="card-img-top" alt="Event">
  <div class="card-body">
    <h5 class="card-title">Python Workshop</h5>
    <p class="card-text">Learn Python basics in 2 hours.</p>
    <a href="#" class="btn btn-primary">Register</a>
  </div>
</div>
```

**No CSS needed!**

**Tailwind Equivalent (More Verbose):**
```html
<div class="rounded-lg shadow-md overflow-hidden">
  <img src="event.jpg" class="w-full h-48 object-cover" alt="Event">
  <div class="p-6">
    <h5 class="text-xl font-bold mb-2">Python Workshop</h5>
    <p class="text-gray-700 mb-4">Learn Python basics in 2 hours.</p>
    <a href="#" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
      Register
    </a>
  </div>
</div>
```

**Result:** Bootstrap faster for tight deadline.

#### 2. **Responsive Grid (Mobile-First)**

**Bootstrap Grid:**
```html
<div class="container">
  <div class="row">
    <div class="col-12 col-md-6 col-lg-4">Event 1</div>
    <div class="col-12 col-md-6 col-lg-4">Event 2</div>
    <div class="col-12 col-md-6 col-lg-4">Event 3</div>
  </div>
</div>
<!-- Mobile: 1 column, Tablet: 2 columns, Desktop: 3 columns -->
```

**No media queries needed!**

#### 3. **Team Familiarity**

**Learning Curve:**
- Bootstrap: 1 day (most team members already know it)
- Tailwind: 1 week (new utility-first paradigm)
- Material UI: 3 days (React components API)

**Timeline Impact:**
- Bootstrap: Start building immediately (Week 1)
- Tailwind: Spend Week 1 learning, start building Week 2

**Decision:** Can't afford 1-week delay.

#### 4. **JavaScript Components Included**

**Bootstrap Includes:**
- Modals (pop-ups)
- Dropdowns (menus)
- Toasts (notifications)
- Carousels (image sliders)
- Collapse (accordions)

**No extra library needed!**

**Example:**
```html
<!-- Modal with Bootstrap JS -->
<button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#myModal">
  Open Modal
</button>

<div class="modal fade" id="myModal">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Confirm Registration</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">Register for this event?</div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
        <button class="btn btn-primary">Confirm</button>
      </div>
    </div>
  </div>
</div>
```

**Tailwind:** Need Headless UI or custom JavaScript.

### Trade-Offs Accepted

**"Bootstrap Look":**
- Many websites use Bootstrap (recognizable)
- Risk of looking generic

**Mitigation:**
- Customize Bootstrap theme (change colors, fonts)
- Add custom components for key features
- Focus on functionality over aesthetics (academic project)

**Large CSS File:**
- Bootstrap CSS: ~200KB (minified)
- Tailwind CSS (purged): ~20KB

**Mitigation:**
- Use CDN (cached by browsers)
- Performance acceptable for project scope

**Decision:** Speed > uniqueness for 8-week timeline.

---

## 7. Language: TypeScript

### The Decision

**Chosen:** TypeScript 5+

### Alternatives Considered

| Language | Pros | Cons | Decision |
|----------|------|------|----------|
| **TypeScript** | Type safety, catch bugs early, great IDE support | Learning curve, more boilerplate | [x] **CHOSEN** |
| **JavaScript (vanilla)** | No learning curve, faster to write | No type safety, runtime errors | [ ] Too risky for team project |
| **Python** | Simpler syntax | No frontend support (Next.js is JS-based) | [ ] Not compatible with Next.js |

### Why TypeScript?

#### 1. **Catch Bugs at Compile Time (Not Runtime)**

**JavaScript (Runtime Error):**
```javascript
function registerUser(email, name) {
  // Typo: "eamil" instead of "email"
  return prisma.user.create({ data: { eamil: email, name } });
}

// Error only happens when user submits form! 💥
```

**TypeScript (Compile Error):**
```typescript
type User = {
  email: string;
  name: string;
};

function registerUser(email: string, name: string) {
  return prisma.user.create({ data: { eamil: email, name } });
  //                                  ^^^^^^
  // ERROR: Object literal may only specify known properties,
  // and 'eamil' does not exist in type User.
}

// Error caught BEFORE deployment [x]
```

#### 2. **IDE Autocomplete (Faster Development)**

**TypeScript:**
```typescript
const event: Event = await prisma.event.findUnique({ where: { id } });

event. // IDE shows: id, title, description, eventDate, location, capacity
```

**JavaScript:**
```javascript
const event = await prisma.event.findUnique({ where: { id } });

event. // IDE shows: nothing (no type information)
```

**Result:** TypeScript = faster coding, fewer typos.

#### 3. **Team Collaboration (Interfaces as Contracts)**

**Scenario:** Person A builds API, Person B builds frontend.

**Without TypeScript:**
```javascript
// Person A (backend)
export async function getEvent(id) {
  return { id, name, date, place };  // "name" and "place"
}

// Person B (frontend) - assumes different field names
const event = await getEvent(id);
console.log(event.title, event.location);  // undefined! 💥
```

**With TypeScript:**
```typescript
// Person A defines interface
export type Event = {
  id: string;
  name: string;  // "name", not "title"
  date: Date;
  place: string; // "place", not "location"
};

export async function getEvent(id: string): Promise<Event> {
  return { id, name, date, place };
}

// Person B
const event: Event = await getEvent(id);
console.log(event.title, event.location);
//                ^^^^^^  ^^^^^^^^^^^^^^
// ERROR: Property 'title' does not exist on type Event.
// ERROR: Property 'location' does not exist on type Event.

// Person B fixes code:
console.log(event.name, event.place);  // [x] Works!
```

#### 4. **Industry Standard**

**Job Postings (Nov 2025):**
- "React + TypeScript": 50,000+ jobs
- "React + JavaScript": 80,000+ jobs (but many prefer TypeScript)

**Trend:** TypeScript adoption growing rapidly.

**Company Usage:**
- Airbnb: TypeScript
- Slack: TypeScript
- Microsoft: TypeScript (obviously)
- Google: Migrating to TypeScript

### Trade-Offs Accepted

**Learning Curve:**
- Generics: `Array<Event>`, `Promise<User>`
- Union types: `status: 'published' | 'draft' | 'cancelled'`
- Type guards: `if (typeof x === 'string')`

**Mitigation:**
- Week 1 TypeScript tutorial
- Start with basic types, add advanced features later
- Team helps each other (pair programming)

**More Boilerplate:**
```typescript
// TypeScript
type CreateEventRequest = {
  title: string;
  description: string;
  eventDate: Date;
};

function createEvent(data: CreateEventRequest): Promise<Event> {
  // ...
}

// JavaScript (shorter)
function createEvent(data) {
  // ...
}
```

**Decision:** Boilerplate worth it for bug prevention.

---

## 8. Authentication: OAuth + JWT

### The Decision

**Chosen:** University OAuth (Microsoft Azure AD) + JWT tokens

### Alternatives Considered

| Auth Method | Pros | Cons | Decision |
|-------------|------|------|----------|
| **OAuth (University SSO)** | No password storage, trusted, official | University approval needed | [x] **CHOSEN** |
| **Email + Password** | Simple, full control | Security risk, password storage | [ ] Backup only |
| **NextAuth.js** | Easy setup, multiple providers | Abstraction layer, learning curve | [ ] Want to understand OAuth directly |
| **Firebase Auth** | Dead simple | Vendor lock-in, costs | [ ] Want self-hosted |
| **Auth0** | Feature-rich, enterprise | Expensive, overkill | [ ] OAuth sufficient |

### Why University OAuth?

#### 1. **No Password Storage (Security)**

**Problem with Passwords:**
- Students reuse passwords (LinkedIn, Facebook, bank)
- If our database leaks → their other accounts compromised
- Legal liability (GDPR, data breach laws)

**OAuth Solution:**
- Students login with university credentials (Microsoft Azure AD)
- We never see their password
- University handles authentication (they have security team)

#### 2. **Automatic Account Verification**

**Problem with Email Registration:**
- Fake emails (temporary email services)
- Need to verify emails (send verification link)
- Students might not verify → can't login

**OAuth Solution:**
- University OAuth only works for real students (verified by university)
- No fake accounts
- Automatic verification (email@university.ie is real)

#### 3. **User Data Sync**

**OAuth Provides:**
- Student ID
- Email address
- Name
- Department (via university API)
- Enrolled courses (via university API)
- Society memberships (via university API)

**Result:** Rich user profiles without manual data entry.

### Why JWT (Not Sessions)?

**Session-Based Auth (Traditional):**
```
User logs in → Server stores session in database
User requests page → Server queries database for session
```

**Problem:** Every request = database query (slow, not scalable)

**JWT-Based Auth:**
```
User logs in → Server generates JWT token (signed)
User requests page → Server validates JWT signature (no database query)
```

**JWT Structure:**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.  ← Header
eyJ1c2VySWQiOiIxMjMiLCJlbWFpbCI6ImpvaG4uZG9lQHVuaXZlcnNpdHkuaWUiLCJleHAiOjE3MDk5ODc2MDB9.  ← Payload (user data)
SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c  ← Signature (verifies authenticity)
```

**Benefits:**
- Stateless (server doesn't store sessions)
- Fast (no database query on every request)
- Scalable (works across multiple servers)

**Trade-Off:** Can't revoke tokens (until expiration).

**Mitigation:** Short expiration (24 hours) + refresh tokens.

### Hybrid Approach: JWT + Redis

**Best of Both Worlds:**
```typescript
// Store JWT session ID in Redis (not full user data)
await redis.setEx(`session:${sessionId}`, 86400, userId);

// Middleware checks:
// 1. JWT valid? (signature check, no DB query)
// 2. Session exists in Redis? (1ms cache check)
```

**Benefits:**
- Fast (JWT + Redis, no PostgreSQL query)
- Revocable (delete Redis key to logout)

---

## 9. Internationalization: next-intl

### The Decision

**Chosen:** next-intl

### Alternatives Considered

| i18n Library | Pros | Cons | Decision |
|--------------|------|------|----------|
| **next-intl** | Built for Next.js App Router, type-safe, SSR | Newer library | [x] **CHOSEN** |
| **react-i18next** | Popular, mature | Not optimized for Next.js SSR | [ ] next-intl better for Next.js |
| **next-translate** | Good Next.js integration | Less active development | [ ] next-intl more modern |
| **FormatJS** | Powerful, ICU message format | Complex setup | [ ] Overkill |
| **Custom Solution** | Full control | Reinventing wheel | [ ] Not enough time |

### Why next-intl?

#### 1. **SSR-Compatible (Critical for Next.js)**

**Problem with react-i18next:**
```javascript
// Client-side only (no SSR)
const { t } = useTranslation();
return <h1>{t('welcome')}</h1>;
// Initial HTML: <h1></h1> (empty!)
// After JS loads: <h1>Welcome</h1>
// Flash of untranslated content (FOUC)
```

**next-intl Solution:**
```typescript
// Server-side rendering
import { useTranslations } from 'next-intl';

const t = useTranslations('home');
return <h1>{t('welcome')}</h1>;
// Initial HTML: <h1>Welcome</h1> (translated!)
// No flash of content
```

#### 2. **Type-Safe Translations**

**JSON Files:**
```json
// messages/en.json
{
  "home": {
    "welcome": "Welcome",
    "subtitle": "Discover events"
  }
}
```

**TypeScript Autocomplete:**
```typescript
const t = useTranslations('home');
t('welcome');   // [x] Valid
t('subtitle');  // [x] Valid
t('invalid');   // [ ] TypeScript error!
```

#### 3. **URL-Based Locales**

**next-intl Routing:**
```
/en/events      → English events page
/ga/events      → Irish events page
/en/societies   → English societies page
/ga/societies   → Irish societies page
```

**Benefits:**
- SEO-friendly (Google indexes both languages)
- Shareable URLs (send Irish link to Irish speaker)
- Browser back button works correctly

---

## 10. Deployment: Docker + AWS

### The Decision

**Chosen:** Docker (containerization) + AWS (cloud deployment)

### Why Docker?

**Problem without Docker:**
```
Dev Machine A: Ubuntu 22.04, Node 20, PostgreSQL 15
Dev Machine B: macOS, Node 18, PostgreSQL 14
Production Server: Ubuntu 24.04, Node 16, PostgreSQL 13

→ "Works on my machine!" problem
```

**Docker Solution:**
```dockerfile
FROM node:20-alpine
# Everyone uses same Node version
# Everyone uses same OS (Alpine Linux)
# PostgreSQL in separate container (same version for all)
```

**Benefits:**
- **Consistency:** Same environment for dev, staging, production
- **Isolation:** Each service (Next.js, PostgreSQL, Redis) in separate container
- **Portability:** Works on any machine with Docker

### Why AWS?

**Requirements:**
- **Scalability:** Handle 100+ concurrent users
- **Reliability:** 99% uptime
- **Database Backups:** Automated, daily
- **CDN:** Fast image delivery (CloudFront)

**AWS Services:**
- **ECS/Fargate:** Run Docker containers (serverless)
- **RDS:** Managed PostgreSQL (auto-backups, scaling)
- **ElastiCache:** Managed Redis (high-availability)
- **S3:** Image storage (scalable, cheap)
- **CloudFront:** CDN (fast global delivery)

**Alternative:** Vercel (Next.js hosting)
- **Pros:** Dead simple, free tier
- **Cons:** Need separate database (Supabase, PlanetScale), less control

**Decision:** AWS for learning experience + full control.

---

## 11. CI/CD: GitHub Actions

### The Decision

**Chosen:** GitHub Actions

### Why GitHub Actions?

**Alternatives:**
- GitLab CI: Good, but we use GitHub (not GitLab)
- CircleCI: Powerful, but complex setup
- Jenkins: Enterprise, overkill
- GitHub Actions: Built-in, free for public repos

**Our Pipeline:**
```yaml
# .github/workflows/ci.yml
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      - run: npm install
      - run: npm run lint    # Check code style
      - run: npm run build   # Build Next.js app
      - run: npm test        # Run tests (if we add them)
```

**Benefits:**
- Automatic checks on every PR
- Prevent broken code from merging
- Deploy to AWS on merge to `main`

---

## 12. Translation API: DeepL

### The Decision

**Chosen:** DeepL API

### Alternatives Considered

| Service | Pros | Cons | Decision |
|---------|------|------|----------|
| **DeepL** | Best quality for Irish, affordable | Paid (after 500k chars) | [x] **CHOSEN** |
| **Google Translate** | Free tier, widely used | Lower quality for Irish | [ ] DeepL better quality |
| **Microsoft Translator** | Free tier, integrated with Azure | Lower quality than DeepL | [ ] DeepL better |
| **Manual Translation** | Highest quality | Slow, not scalable | [x] **PREFERRED** (but optional) |

### Why DeepL?

**Irish Language Support:**
- DeepL specializes in European languages (including Irish)
- Better than Google Translate for Irish (tested)

**Pricing:**
- Free tier: 500,000 characters/month
- Paid tier: €5 per 1 million characters

**Example:**
- 1 event description: ~200 characters
- 1,000 events = 200,000 characters = €1

**Affordable for student project.**

---

## Summary: Technology Stack Overview

| Component | Technology | Why Chosen |
|-----------|-----------|------------|
| **Frontend Framework** | Next.js 14 + React 18 | Full-stack, SSR/CSR hybrid, industry-standard |
| **Language** | TypeScript | Type safety, catch bugs early, great IDE support |
| **UI Framework** | Bootstrap 5 | Fast prototyping, responsive, team familiarity |
| **Database** | PostgreSQL 15+ | JSONB support, ACID, relational data, industry-standard |
| **Database Access** | pg (postgres) | Full SQL control, lightweight, performance |
| **Caching** | Redis 7+ | Speed (1-2ms), session storage, recommendation pre-computation |
| **Authentication** | OAuth + JWT | No password storage, automatic verification, scalable |
| **i18n** | next-intl | SSR-compatible, type-safe, URL-based locales |
| **Deployment** | Docker + AWS | Consistency, scalability, reliability, learning value |
| **CI/CD** | GitHub Actions | Built-in, free, easy setup, automatic checks |
| **Translation API** | DeepL | Best quality for Irish, affordable |

---

**Related Documents:**
- [01_PROJECT_EVOLUTION.md](./01_PROJECT_EVOLUTION.md) - How we chose the project
- [ARCHITECTURE_AND_TECH_STACK.md](./ARCHITECTURE_AND_TECH_STACK.md) - System architecture
- [03_DATABASE_DESIGN_DECISIONS.md](./03_DATABASE_DESIGN_DECISIONS.md) - Database schema rationale

---

**Last Updated:** November 24, 2025
**Author:** Development Team
**Maintained By:** Semyon (Project Manager)
