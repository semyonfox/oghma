# System Architecture

**Technical design and architecture for the University Society Platform (SocsBoard)**

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture Patterns](#2-architecture-patterns)
3. [Data Flow](#3-data-flow)
4. [Technology Stack Summary](#4-technology-stack-summary)
5. [Next.js Architecture](#5-nextjs-architecture)
6. [Database Architecture](#6-database-architecture)
7. [Caching Strategy](#7-caching-strategy)
8. [Authentication Flow](#8-authentication-flow)
9. [Multilingual Architecture](#9-multilingual-architecture)
10. [Deployment Architecture](#10-deployment-architecture)

---

## 1. System Overview

### High-Level Architecture

The platform is a **monolithic Next.js application** with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT (Browser)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  next-intl   │  │ React State  │  │ localStorage │  │
│  │  (UI i18n)   │  │   Context    │  │   (theme)    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                           ↕
┌─────────────────────────────────────────────────────────┐
│              NEXT.JS SERVER (App Router)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Middleware   │  │  API Routes  │  │ Server Pages │  │
│  │ (auth, lang) │  │              │  │     (SSR)    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                           ↕
┌─────────────────────────────────────────────────────────┐
│                  DATABASE LAYER                          │
│  ┌─────────────────────────┐  ┌─────────────────────┐  │
│  │   PostgreSQL (Primary)  │  │    Redis (Cache)    │  │
│  │  • Events, posts, users │  │  • Sessions         │  │
│  │  • Societies, members   │  │  • Recommendations  │  │
│  │  • Recommendations      │  │  • Popular content  │  │
│  └─────────────────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

For visual diagrams, see [Stack Diagram.excalidraw.md](Stack%20Diagram.excalidraw.md)

---

## 2. Architecture Patterns

### Monolithic Architecture

**Why monolithic?**
- Simpler deployment (single container)
- Easier development (no inter-service communication)
- Shared types and utilities
- Better for team of 4 with 8-week timeline
- Can migrate to microservices later if needed

### Layered Architecture

```
┌─────────────────────────────────────┐
│      Presentation Layer (UI)        │  ← React components, pages
├─────────────────────────────────────┤
│    Application Layer (API Routes)   │  ← Business logic, controllers
├─────────────────────────────────────┤
│    Domain Layer (Models/Services)   │  ← Core business entities
├─────────────────────────────────────┤
│   Data Access Layer (lib/db.js)     │  ← Database queries
├─────────────────────────────────────┤
│     Infrastructure (PostgreSQL)      │  ← Database + Cache
└─────────────────────────────────────┘
```

---

## 3. Data Flow

### User Authentication Flow

```
User clicks "Login with University"
  ↓
Redirect to Microsoft Azure AD
  ↓
User authenticates with university credentials
  ↓
Callback to /api/auth/callback with auth code
  ↓
Exchange code for tokens
  ↓
Fetch user info from university API (optional)
  ↓
Create/update user in database
  ↓
Generate JWT and store session in cookie
  ↓
Redirect to dashboard
```

### Event Discovery Flow

```
User visits homepage
  ↓
SSR: Fetch recommended events from Redis cache
  ↓
If cache miss: Query database with personalized algorithm
  ↓
Render event cards (SSR for SEO)
  ↓
Client-side: User interactions (like, register)
  ↓
API calls update database
  ↓
Invalidate relevant caches
```

### Content Creation Flow

```
Society admin creates event
  ↓
POST /api/events with form data
  ↓
Validate auth and permissions (JWT middleware)
  ↓
Upload image to storage (local or S3)
  ↓
Insert event to database (with translations)
  ↓
Invalidate relevant caches in Redis
  ↓
Trigger recommendation recalculation (async)
  ↓
Return success, redirect to event page
```

---

## 4. Technology Stack Summary

For detailed rationale, see [decisions/02_tech_stack.md](decisions/02_tech_stack.md)

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | Next.js 16 + React 19 | Full-stack framework with SSR/CSR |
| **UI Framework** | Bootstrap 5 | Responsive styling |
| **Language** | TypeScript | Type safety |
| **Database** | PostgreSQL 15+ | Primary data store |
| **Cache** | Redis 7+ | Session + data caching |
| **Auth** | JWT + OAuth | Authentication |
| **i18n** | next-intl | Multilingual support |
| **DevOps** | Docker + GitHub Actions | Containerization + CI/CD |
| **Deployment** | AWS (ECS/RDS) | Production hosting |

---

## 5. Next.js Architecture

### The Key Concept: Next.js is BOTH Frontend AND Backend

Unlike traditional setups with separate repos, Next.js is a **full-stack framework**.

```
ct216_project/
├── src/app/
│   ├── api/                        # BACKEND - API Routes
│   │   ├── auth/
│   │   │   ├── login/route.ts      # POST /api/auth/login
│   │   │   └── register/route.ts   # POST /api/auth/register
│   │   └── events/
│   │       └── route.ts            # GET/POST /api/events
│   │
│   ├── login/                      # FRONTEND - Pages
│   │   └── page.js                 # Login page UI
│   ├── register/
│   │   └── page.js                 # Registration page UI
│   └── page.js                     # Homepage
│
├── src/lib/                        # Shared utilities
│   ├── db.js                       # Database connection
│   └── auth.js                     # Auth helpers
│
└── src/database/                   # Database setup
    └── setup.sql                   # Schema definitions
```

### SSR vs CSR: When to Use Each

**Use SSR (Server-Side Rendering) for:**
- SEO-critical pages (homepage, event listings)
- Fast first load (login, registration)
- Public pages (anything Google needs to index)

**Use CSR (Client-Side Rendering) for:**
- Interactive dashboards (real-time updates)
- Private pages (behind authentication)
- Complex forms (multi-step, validation)

---

## 6. Database Architecture

For detailed schema decisions, see [decisions/03_database_design.md](decisions/03_database_design.md)

### Core Tables

```sql
-- Users & Authentication
CREATE TABLE login (
    user_id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Events (planned)
CREATE TABLE events (
    event_id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    event_date TIMESTAMP NOT NULL,
    location VARCHAR(255),
    capacity INT,
    created_by INT REFERENCES login(user_id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Registrations (planned)
CREATE TABLE registrations (
    registration_id SERIAL PRIMARY KEY,
    event_id INT REFERENCES events(event_id),
    user_id INT REFERENCES login(user_id),
    registered_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(event_id, user_id)
);
```

### Key Design Decisions

1. **Normalized schema** for structured data (events, users)
2. **JSONB columns** for flexible data (future: translations, metadata)
3. **Foreign keys** enforce referential integrity
4. **Indexes** on frequently queried columns (email, event_date)

---

## 7. Caching Strategy

For detailed implementation, see [guides/redis_caching.md](guides/redis_caching.md)

### Redis Cache Layers

| Data Type | Cache Duration | Key Pattern | Invalidate On |
|-----------|----------------|-------------|---------------|
| **Session data** | Session length | `session:{sessionId}` | Logout |
| **User profile** | 1 hour | `user:{userId}` | Profile update |
| **Event details** | 30 minutes | `event:{eventId}` | Event update |
| **Event list** | 5 minutes | `events:list` | New event created |

### Cache Invalidation Strategy

- **Write-through**: Update DB → invalidate cache
- **TTL-based**: Short TTL for frequently changing data
- **Event-driven**: Specific actions trigger cache clears

---

## 8. Authentication Flow

### Current Implementation (JWT)

```javascript
// Login flow
POST /api/auth/login
  ↓
Verify email + password (bcrypt)
  ↓
Generate JWT token (payload: userId, email)
  ↓
Set HTTP-only cookie (secure: true in production)
  ↓
Return success response
```

### Planned: University OAuth Integration

```
User → OAuth provider (Microsoft Azure AD)
  ↓
Auth code → /api/auth/callback
  ↓
Exchange for access token
  ↓
Fetch user profile from university API
  ↓
Create/update user in database
  ↓
Generate JWT session
  ↓
Redirect to dashboard
```

---

## 9. Multilingual Architecture

### Two-Layer i18n Strategy

**1. UI Translation (Static Content)**
- Library: `next-intl`
- Storage: JSON files (`/messages/en.json`, `/messages/ga.json`)
- Scope: Buttons, labels, error messages

**2. Content Translation (User-Generated)**
- Future implementation
- Storage: Database JSONB or separate translation tables
- Scope: Event titles, descriptions, posts

### Language Detection

1. Check user preference (database)
2. Check cookie (`NEXT_LOCALE`)
3. Check browser `Accept-Language` header
4. Default to English

---

## 10. Deployment Architecture

For detailed deployment guide, see [DEPLOYMENT.md](DEPLOYMENT.md)

### Current: Docker Development

```
Docker Compose Stack:
├── ct216_web (Next.js app)
├── PostgreSQL (database)
└── Redis (cache) - planned
```

### Planned: AWS Production

```
AWS Services:
├── ECS/EC2 → Next.js application
├── RDS PostgreSQL → Database
├── ElastiCache Redis → Cache
├── S3 → Image uploads
├── CloudFront → CDN
└── Route 53 → DNS
```

### Migration Path

```
Phase 1: Local Development (current)
  ↓
Phase 2: Docker Containerization (current)
  ↓
Phase 3: Cloudflare Tunnel (current)
  ↓
Phase 4: AWS Deployment (planned)
```

---

## Architectural Principles

### 1. Separation of Concerns
- Clear boundaries between UI, business logic, and data
- API routes handle business logic
- Components focus on presentation

### 2. Scalability First
- Stateless API design (JWT, not sessions)
- Caching layer reduces database load
- Horizontal scaling possible (multiple containers)

### 3. Security by Design
- Password hashing with bcrypt
- JWT with HTTP-only cookies
- Prepared statements prevent SQL injection
- Input validation on all endpoints

### 4. Developer Experience
- Type safety with TypeScript (planned)
- Hot reload in development
- Clear folder structure
- Comprehensive documentation

---

## Related Documentation

- **[decisions/02_tech_stack.md](decisions/02_tech_stack.md)** - Why we chose these technologies
- **[decisions/03_database_design.md](decisions/03_database_design.md)** - Database schema rationale
- **[DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md)** - Development workflow
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Deployment instructions

---

**Last Updated:** 2025-01-25
**Maintained By:** Semyon (Project Manager)
