# Architecture Decisions

**Summary of key technical choices for SocsBoard**

This document provides a concise overview of our major architectural decisions. For detailed analysis, research, and alternatives considered, see the archived decision records in `docs/archive/decisions/`.

Last Updated: February 11, 2026

---

## 1. Project Choice: University Society Platform

### Decision

Build a social platform connecting university students with society events and content through personalized recommendations, featuring multilingual support for Irish and English.

### Context

**Module:** CT216 Software Engineering I
**Timeline:** 8 weeks development
**Team Size:** 4 members
**Constraints:** Limited time, mixed experience levels, concurrent courses

### Rationale

**Why a society platform:**
- Clear user need: students struggle to discover relevant events across 50+ societies
- Well-scoped problem: achievable in 8 weeks while demonstrating technical depth
- Parallelizable work: events, societies, posts, recommendations can be built independently
- Real-world relevance: applicable to any university

**Why not a web-based CAD system (initial idea):**
- Time complexity: 5-6 weeks just setting up OpenCascade.js geometry kernel
- Technical overhead: WebAssembly memory management, sparse documentation
- Non-parallelizable: team would be blocked on core CAD functionality
- Assessment risk: might demonstrate ambition but not software engineering principles

### Key Features

- Event discovery and registration
- Society profiles and following
- Social posts feed
- Personalized recommendations
- Bilingual content (Irish/English)

### Full Analysis

See `docs/archive/decisions/01_project_choice.md` for complete research including CAD system evaluation, scope evolution, and alternatives considered.

---

## 2. Technology Stack

### Decisions

| Component | Technology | Key Reason |
|-----------|-----------|------------|
| **Frontend** | Next.js 16 (App Router) + React 19 | Full-stack in one framework, SSR/CSR hybrid, API routes |
| **Backend** | Next.js API Routes | Integrated with frontend, no CORS, shared TypeScript types |
| **Database** | PostgreSQL 15+ | Advanced JSONB support, proven reliability, ACID compliance |
| **ORM** | node-postgres (pg) | Direct control, lightweight, no abstraction overhead |
| **Cache** | Redis 7+ | High performance, standard for session/query caching |
| **UI Framework** | Bootstrap 5 | Rapid development, team familiarity, responsive grid |
| **Language** | JavaScript/TypeScript | Next.js ecosystem, gradual typing adoption |
| **Auth** | JWT + bcrypt | Stateless tokens, HTTP-only cookies, industry standard |
| **i18n** | next-intl | Next.js integration, locale routing, translation management |
| **Deployment** | AWS Amplify + Lambda | Serverless, auto-scaling, integrated CI/CD |

### Why Next.js?

**Full-stack simplicity:**
```
Traditional:  React (3000) ←fetch→ Express (5000) ←query→ Database
Next.js:      Frontend + API ←query→ Database (single app, port 3000)
```

**Benefits:**
- No CORS configuration needed
- Shared types across frontend and backend
- Single deployment
- SSR for public pages (SEO), CSR for dashboards
- Built-in API routes replace Express.js

**Industry demand:**
- React: 80,000+ job postings
- Next.js: 15,000+ job postings
- Maximizes resume value

### Why PostgreSQL?

**Advanced features we use:**
- JSONB for flexible multilingual content storage
- GIN indexes for fast JSONB queries
- Partial indexes for optimized filtering
- Transactional guarantees for event registration
- Foreign keys for referential integrity

**Alternatives considered:**
- MongoDB: flexible but lacks ACID, weaker consistency
- MySQL: proven but limited JSONB support
- Firebase: easy but vendor lock-in, expensive at scale
- Supabase: promising but adds complexity

**Decision:** PostgreSQL provides both structure (relational) and flexibility (JSONB) without compromising data integrity.

### Why Redis?

**Use cases:**
- Session storage (JWT blacklist for logout)
- Query result caching (event listings)
- Rate limiting (login attempts)
- Real-time counters (registration counts)

**Performance:**
- Sub-millisecond reads
- Reduces database load by 60-80%
- Simple key-value interface

### Why Bootstrap 5?

**Pragmatic choice:**
- Team already familiar
- Rapid prototyping with pre-built components
- Responsive grid system
- Consistent UI without custom CSS

**Not Tailwind:** considered but removed to reduce bundle size and avoid dual-framework complexity.

### Why JWT Authentication?

**Stateless tokens:**
- No server-side session storage required
- Scales horizontally (any server can verify)
- Mobile-friendly (store in secure storage)

**Implementation:**
- HTTP-only cookies (XSS protection)
- Short expiration (1 hour)
- Refresh token pattern for extended sessions
- bcrypt for password hashing (industry standard)

### Why AWS Amplify + Lambda?

**Deployment strategy:**
- Amplify for Next.js frontend (SSR support, CDN, CI/CD)
- Lambda for Python recommendation service (independent scaling)
- RDS for PostgreSQL (managed, automated backups)
- CloudWatch for logging and monitoring

**Benefits:**
- Serverless: pay only for usage
- Auto-scaling: handles traffic spikes
- Free tier: covers development phase
- Integrated: single AWS account

### Full Analysis

See `docs/archive/decisions/02_tech_stack.md` (1,200+ lines) for:
- Detailed comparison matrices for each technology
- Proof-of-concept findings
- Performance benchmarks
- Cost analysis
- Learning curve assessment
- Job market research

---

## 3. Database Design

### Translation Storage Strategy

**Decision:** Hybrid approach using JSONB for flexible content, relational for structured data

**Schema pattern:**
```sql
CREATE TABLE events (
  id UUID PRIMARY KEY,
  society_id UUID REFERENCES societies(id),
  title JSONB NOT NULL,  -- {"en": "Music Night", "ga": "Oíche Cheoil"}
  description JSONB,
  location VARCHAR(255),
  event_date TIMESTAMP NOT NULL,
  max_capacity INT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_events_title_gin ON events USING GIN (title);
```

### Why JSONB for translations?

**Advantages:**
1. **Language flexibility:** add French, Spanish without schema migration
2. **Partial translations:** some content only in English is acceptable
3. **Fast queries:** GIN indexes enable efficient JSONB searches
4. **Type safety:** can validate structure at application level

**Query example:**
```sql
-- Get English title
SELECT title->>'en' AS title FROM events;

-- Search across all languages
SELECT * FROM events WHERE title @> '{"en": "Music"}';
```

### Why not separate translation tables?

**Rejected approach:**
```sql
-- Would require this complexity:
CREATE TABLE event_translations (
  event_id UUID,
  language VARCHAR(5),
  title VARCHAR(255),
  description TEXT,
  PRIMARY KEY (event_id, language)
);
```

**Problems:**
- Complex joins for every query
- Hard to enforce "at least one translation exists"
- More tables to maintain
- Slower queries (join overhead)

### Data Integrity

**Enforced constraints:**
- Foreign keys: all society_id references must exist
- Unique indexes: prevent duplicate event registrations
- Check constraints: max_capacity > 0, valid date ranges
- NOT NULL: required fields always present

**Transactional safety:**
```sql
-- Event registration prevents overbooking
BEGIN;
  SELECT COUNT(*) FROM event_registrations WHERE event_id = $1 FOR UPDATE;
  -- Check capacity, then insert
  INSERT INTO event_registrations (event_id, user_id) VALUES ($1, $2);
COMMIT;
```

### Indexing Strategy

**Optimized indexes:**
```sql
-- Fast event lookups by society
CREATE INDEX idx_events_society ON events(society_id);

-- Fast date-based queries (upcoming events)
CREATE INDEX idx_events_date ON events(event_date) WHERE event_date > NOW();

-- Fast text search across translations
CREATE INDEX idx_events_title_gin ON events USING GIN (title);

-- Fast registration lookups
CREATE INDEX idx_registrations_composite ON event_registrations(event_id, user_id);
```

### Trade-offs

**JSONB cons we accepted:**
- Slightly larger storage vs. VARCHAR columns
- Need application-level validation of JSON structure
- Migration complexity if changing JSON schema

**Why acceptable:**
- Storage cost negligible (GBs vs. TBs)
- Validation handled by TypeScript types
- Flexibility worth the trade-off for multilingual platform

### Full Schema

Complete database schema with all tables, indexes, and constraints documented in `docs/DATABASE_SCHEMA.md`.

### Full Analysis

See `docs/archive/decisions/03_database_design.md` for:
- Detailed comparison of 3 translation storage approaches
- Performance benchmarks
- Migration strategies
- Normalization trade-offs
- Query optimization examples

---

## 4. Recommendation System

### Decision

Hybrid recommendation system using content-based filtering and collaborative filtering, implemented as a separate Python service.

### Architecture

**Separate microservice:**
```
Next.js App (Node.js)
  ↓ HTTP POST /api/recommendations
Python Service (Flask/FastAPI)
  ↓ queries
PostgreSQL + Redis
```

**Why separate from Next.js:**
- Python ecosystem for ML (scikit-learn, pandas, numpy)
- Independent scaling (recommendations compute-heavy)
- Doesn't block main app
- Can upgrade to ML models later without touching Next.js code

### Algorithm Design

**Hybrid scoring system:**
```python
score = (
  society_membership_weight * 0.4 +
  category_preference_weight * 0.3 +
  attendance_history_weight * 0.2 +
  social_signals_weight * 0.1
)
```

**Factors considered:**
1. **Society membership:** events from joined societies rank higher
2. **Category preference:** inferred from past registrations and interactions
3. **Attendance history:** similar events user attended previously
4. **Social signals:** events friends registered for

### Data Sources

**User profile:**
- Joined societies
- Past event registrations
- Post likes and interactions
- Explicit interest tags

**Event features:**
- Society ID
- Category (music, sports, academic, social)
- Location
- Time of day
- Capacity and registration count

**Collaborative signals:**
- Users with similar profiles
- Events frequently co-registered

### Performance

**Response time:**
- Recommendations computed every 30 minutes
- Cached in Redis (TTL: 30 min)
- API response: <100ms (cache hit)

**Scalability:**
- Pre-compute recommendations for all users in background job
- Store in Redis hash: `user:{id}:recommendations`
- Refresh incrementally (only active users)

### Why Python over Node.js?

**Python advantages:**
- Rich ML libraries (scikit-learn for future model upgrades)
- Pandas for data manipulation
- Mature recommendation frameworks (Surprise, LightFM)
- Team member experienced in Python

**Node.js considered but rejected:**
- Limited ML ecosystem
- Would need to rewrite logic if upgrading to ML models
- Python is industry standard for recommendations

### Implementation Plan

**Phase 1 (Week 5):** Simple scoring algorithm
- Basic weighted formula
- No ML, just heuristics
- Proves concept

**Phase 2 (Week 6):** Collaborative filtering
- User-user similarity
- Item-item similarity
- Matrix factorization (optional)

**Phase 3 (Future):** ML-based
- Train models on historical data
- A/B test different algorithms
- Click-through rate optimization

### Deployment

**Development:** Docker container alongside Next.js
**Production:** AWS Lambda or ECS (separate from Next.js)

**API contract:**
```
POST /recommend
Body: { user_id: "uuid", limit: 10 }
Response: [{ event_id, score, reason }]
```

### Full Analysis

See `docs/archive/decisions/04_recommendation_system.md` for:
- Detailed algorithm research
- Alternative approaches evaluated (collaborative, content-based, hybrid)
- Technology comparison (Python vs Node.js vs cloud services)
- Integration architecture diagrams
- Performance benchmarks
- Deployment strategies

---

## Decision-Making Process

### Our Framework

For each major decision:

1. **Research:** identify 3-5 alternatives
2. **Criteria:** define evaluation metrics (time, cost, learning curve, scalability)
3. **Prototype:** build proof-of-concept with top 2 choices
4. **Compare:** score each option against criteria
5. **Decide:** team consensus or majority vote
6. **Document:** record rationale for future reference

### Key Principles

- **Pragmatism over perfection:** choose good enough, ship on time
- **Learn as we build:** start simple, iterate based on real needs
- **Industry alignment:** prefer standard patterns over clever solutions
- **Team capacity:** consider current skills and learning bandwidth
- **Timeline constraints:** 8 weeks is non-negotiable

### Evolution

Decisions documented here reflect our current understanding. We revisit and update as we learn from implementation.

### Changelog

- **2026-01-25:** Initial decision records created
- **2026-02-11:** Condensed into single decisions document

---

## Further Reading

### Detailed Analysis

Each decision has extensive research documented in archive:

- **01_project_choice.md** - Why society platform over CAD system (13KB)
- **02_tech_stack.md** - Technology evaluation matrices (35KB)
- **03_database_design.md** - Translation storage strategies (20KB)
- **04_recommendation_system.md** - Algorithm design and integration (24KB)

**Total research:** 93KB of detailed rationale preserved for assignment review

### Related Documentation

- **docs/ARCHITECTURE.md** - System design and component interaction
- **docs/DATABASE_SCHEMA.md** - Complete schema with all tables
- **docs/REQUIREMENTS.md** - Formal software requirements specification
- **docs/DEPLOYMENT.md** - AWS production deployment guide

---

**Maintained by:** Semyon (Tech Lead)
**Last Updated:** February 11, 2026
