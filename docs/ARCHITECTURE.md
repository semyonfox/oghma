# OghmaNotes Architecture

## Current Architecture (Production-Ready)

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React 19)                      │
│  ├─ Next.js 16 (SSR/SSG)                                    │
│  ├─ Tailwind CSS 4 + TypeScript                             │
│  ├─ Lexical Editor (rich text)                              │
│  └─ Zustand (state management)                              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│               API Layer (Next.js Route Handlers)            │
│  ├─ Authentication (bcryptjs + JWT)                         │
│  ├─ Password Reset (nodemailer + AWS SES)                   │
│  ├─ Note CRUD (postgres.js queries)                         │
│  ├─ File Uploads (AWS S3 SDK)                               │
│  ├─ CORS Middleware (dynamic origins)                       │
│  └─ Proxy Middleware (session validation)                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              Data Layer (PostgreSQL + S3)                   │
│  ├─ RDS PostgreSQL (user data, notes, auth)                 │
│  ├─ AWS S3 (file storage)                                   │
│  └─ AWS SES (email delivery)                                │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│           Deployment (AWS Amplify)                          │
│  ├─ Auto build on git push                                  │
│  ├─ 10-minute build time                                    │
│  ├─ Environment variable management                         │
│  └─ CloudFront CDN caching                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Current |
|-------|---------|
| **Framework** | Next.js 16 |
| **Language** | TypeScript |
| **UI Library** | React 19 |
| **Styling** | Tailwind 4 |
| **State Management** | Zustand |
| **Editor** | Lexical |
| **Database Access** | postgres.js |
| **Authentication** | bcryptjs + JWT |
| **Email** | nodemailer + AWS SES |
| **Storage** | AWS S3 |

---

## Performance Metrics

### Build Time
- **Next.js Compilation:** 25-31s
- **Static Page Generation:** 4-6s
- **Total Build:** ~10 minutes on Amplify
- **Bundle Size:** ~1.2MB (JavaScript)

### Runtime Performance
- **First Contentful Paint (FCP):** ~1.2s (local), ~2.5s (over network)
- **Time to Interactive (TTI):** ~2.1s
- **Largest Contentful Paint (LCP):** ~2.5s
- **Login API:** ~100ms (bcryptjs + DB)
- **Route Protection:** ~1-2ms (JWT decode)

### Database Performance
- **Connection Pool:** 20 concurrent connections (postgres.js)
- **Query Response:** 10-50ms (simple queries)
- **Password Reset Email:** ~2-3s (AWS SES network latency)

---

## Data Flow

### User Registration
```
1. Form Submission → POST /api/auth/register
2. Validate email & password strength
3. Hash password with bcryptjs (10 salt rounds)
4. Insert into database (app.login table)
5. Generate JWT token
6. Set HTTP-only session cookie
7. Redirect to /notes
```

### User Login
```
1. Form Submission → POST /api/auth/login
2. Find user by email in database
3. Compare password with bcryptjs
4. Rate limiting check (5 failed attempts = lockout)
5. Generate JWT if match
6. Set HTTP-only session cookie
7. Redirect to /notes
```

### Password Reset
```
1. User clicks "Forgot Password"
2. POST /api/auth/password-reset/request with email
3. Generate secure token (crypto.randomBytes 32 bytes)
4. Store token in DB with 1-hour expiry
5. Send email via nodemailer + AWS SES
6. User clicks link in email
7. User enters new password
8. POST /api/auth/password-reset/verify with token
9. Validate token, hash new password, update DB
10. Clear token from DB
```

### Note Creation/Update
```
1. POST /api/notes with title, content
2. Proxy middleware validates session cookie
3. JWT decoded to get user_id
4. Insert/update in app.notes table
5. Return note with updated_at timestamp
```

### File Upload (Async, Currently UI-only)
```
1. User selects file
2. Get presigned URL from /api/upload
3. Browser uploads directly to S3
4. Save file metadata to app.files table
5. Link file in note content
```

---

## Security Architecture

### Authentication
- **Password Storage:** bcryptjs with 10 salt rounds (OWASP recommended)
- **Session Token:** JWT (HS256 algorithm)
- **Cookie Storage:** HTTP-only, Secure, SameSite=Strict
- **Token Expiry:** 7 days (configurable)

### API Security
- **Rate Limiting:** 5 failed login attempts = 15-minute lockout
- **CORS:** Dynamic origin validation (allowlist-based)
- **SQL Injection:** Parameterized queries via postgres.js
- **Email Enumeration:** Generic messages on password reset

### Infrastructure Security
- **Database:** RDS with security groups (private VPC)
- **S3:** Bucket policies restrict public access
- **Environment Variables:** Managed by Amplify (not in code)
- **SSL/TLS:** CloudFront enforces HTTPS

---

## Scaling Considerations

### Current Limits
- **Concurrent Users:** ~1,000 without optimization
- **Monthly API Calls:** ~50M (free tier limit on AWS)
- **Database Connections:** 20 pooled connections
- **Email Rate:** 14 emails/second (SES sandbox limit)

### Scaling Path

#### Phase 1: Small (0-1K users)
**Current Setup** - No changes needed
- RDS PostgreSQL t3.micro
- S3 standard storage
- SES sandbox (manual increase to sending limit)
- Amplify standard deployment

#### Phase 2: Growth (1K-10K users)
**Optimizations needed:**
1. **Database Caching**
   ```bash
   # Add ElastiCache Redis
   npm install redis
   # Cache session tokens (avoid DB hit per request)
   # Cache frequently accessed notes
   ```

2. **CDN for Static Assets**
   - Already provided by CloudFront
   - Ensure Cache-Control headers set correctly

3. **Email Queue**
   ```bash
   # Replace direct nodemailer with SQS + Lambda
   # Rate limit: 14 emails/sec (SES sandbox)
   # Request sending limit increase in console
   ```

4. **Database Optimization**
   - Add indexes on frequently queried columns
   - Implement query result caching
   - Connection pooling (already done with postgres.js)

5. **Upgrade to Prisma** (when complexity grows)
   ```bash
   npm install @prisma/client prisma
   prisma migrate dev
   # Replaces raw SQL with type-safe queries
   ```

#### Phase 3: Scale (10K-100K users)
**Architecture changes:**
1. **Multi-region Deployment**
   - Primary: US-East
   - Secondary: EU, Asia Pacific
   - DynamoDB for global sessions

2. **Microservices**
   - Separate auth service
   - Separate note service
   - Separate file upload service

3. **Advanced Auth**
   ```bash
   # Activate better-auth
   npm install better-auth
   # Add OAuth providers (Google, GitHub)
   # Add 2FA/MFA
   # Device tracking
   ```

4. **Real-time Collaboration**
   ```bash
   npm install socket.io
   # Websocket server for live note editing
   # Conflict resolution (Operational Transformation or CRDT)
   ```

---

## File Structure

```
src/
├── app/
│   ├── api/
│   │   └── auth/
│   │       ├── login/route.js
│   │       ├── register/route.js
│   │       ├── password-reset/
│   │       │   ├── request/route.js
│   │       │   └── verify/route.js
│   │       └── logout/route.js
│   ├── login/page.js
│   ├── register/page.js
│   ├── notes/page.tsx
│   ├── settings/page.jsx
│   └── forgot-password/page.jsx
│
├── components/
│   ├── layout/
│   │   └── vscode-layout.tsx
│   ├── editor/
│   │   └── editor.tsx (Lexical wrapper)
│   ├── sidebar/
│   │   └── icon-nav.tsx
│   └── notes/
│       └── providers.tsx
│
├── lib/
│   ├── auth.js (JWT, error responses)
│   ├── email.js (nodemailer config)
│   ├── rateLimit.js (failed login tracking)
│   ├── accountLockout.js (account protection)
│   ├── validation.js (input validation)
│   ├── cors.js (removed - now in proxy.ts)
│   └── notes/
│       ├── hooks/ (use-toast, etc)
│       ├── state/ (Zustand stores)
│       └── cache/ (IndexedDB caching)
│
├── database/
│   └── pgsql.js (postgres.js connection)
│
├── proxy.ts (Middleware for auth + CORS)
└── middleware.js (removed - merged into proxy.ts)

docs/
├── FINAL_QUICK_START.md (Deployment guide)
├── QUICK_START_AUTH.md (Auth setup)
├── SYSTEM_STATUS.md (Feature status)
├── AUTH_STANDBY.md (Auth systems comparison)
└── ARCHITECTURE.md (This file)
```

---

## Key Design Decisions

| Decision | Trade-off |
|----------|-----------|
| bcryptjs + JWT | OWASP standard, works in Amplify (simpler than Argon2) |
| postgres.js | Lightweight, explicit SQL (vs Prisma ORM overhead) |
| Zustand | Minimal boilerplate (adequate for current scale) |
| Lexical editor | Rich features, Meta-backed (larger bundle) |
| AWS S3 + SES | Scalable infrastructure |

---

## Roadmap

| Phase | Target | Focus |
|-------|--------|-------|
| Q1 2026 | Full-text search (PostgreSQL FTS) | Phase 1 |
| Q2 2026 | AI features (summarization, tagging) | Phase 2 |
| Q3 2026 | Real-time collaboration (WebSocket) | Phase 3 |
| Q4 2026 | OAuth providers (Google, GitHub) | Auth |

---

## Testing

| Type | Command | Focus |
|------|---------|-------|
| Unit | `npm test` | Auth, validation, hashing |
| Integration | - | Login flow, email, S3 upload |
| Load | - | 1K concurrent users, latency |
| Security | `npm audit` | Vulnerabilities, OWASP Top 10 |

---

## Monitoring

| Category | Tool |
|----------|------|
| Builds | Amplify Console |
| Logs | CloudWatch |
| Database | RDS Performance Insights |
| Storage | S3 Metrics |

**Key Metrics:** Login rates, API latency, error rates, daily active users

---

## Disaster Recovery

| Scenario | Recovery |
|----------|----------|
| Database failure | RDS snapshot restore (~15 mins) |
| Credential breach | Rotate JWT secret, force re-login |
| Code corruption | Revert git commit, redeploy |
| File loss | S3 versioning enabled |

---

## Scaling Checkpoints

- **10K+ users:** Consider Prisma, Redis caching, query optimization
- **Performance issues:** Add database indexes, implement CDN caching
- **Real-time needed:** WebSocket server + CRDT library
- **Complex auth:** Upgrade to better-auth with OAuth

