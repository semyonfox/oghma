# AWS Migration Master Guide: Complete Analysis & Implementation

**Last Updated:** February 2026
**Project:** CT216 Socsboard
**Scope:** Full AWS serverless migration from Docker + local deployment

---

## TABLE OF CONTENTS

### Part 1: Executive Summary & Current State
- [TL;DR: Quick Facts](#tldr-quick-facts)
- [Why Migrate to AWS?](#why-migrate-to-aws)
- [Timeline & Effort](#timeline--effort)
- [Cost Overview](#cost-overview)

### Part 2: Current Codebase Analysis
- [Critical Issues Found](#critical-issues-found)
- [Security Vulnerabilities](#security-vulnerabilities)
- [Database Design](#database-design)
- [Performance Bottlenecks](#performance-bottlenecks)
- [Over-engineering Problems](#over-engineering-problems)
- [Missing Features & API Gaps](#missing-features--api-gaps)
- [Testing Gaps](#testing-gaps)

### Part 3: Service-by-Service Breakdown
- [Compute: Docker → Lambda](#compute-docker--aws-lambda)
- [API: Next.js Routes → API Gateway](#api-nextjs-routes--api-gateway)
- [Database: Local PostgreSQL → RDS](#database-local-postgresql--aws-rds)
- [Frontend: Docker Server → S3 + CloudFront](#frontend-docker-server--s3--cloudfront)
- [Secrets: .env Files → Secrets Manager](#secrets-env-files--aws-secrets-manager)
- [Logging: Console → CloudWatch](#logging-console--cloudwatch)

### Part 4: AWS Strategy & Architecture
- [Architecture Overview](#architecture-overview)
- [AWS Service Mapping](#aws-service-mapping)
- [Revised Priorities for AWS](#revised-priorities-for-aws)
- [Migration Timeline](#migration-timeline)

### Part 5: Cost Analysis
- [Free Tier Coverage](#free-tier-coverage)
- [Cost by Scenario](#cost-by-scenario)
- [Service-by-Service Pricing](#service-by-service-pricing)
- [Cost Control & Budgeting](#cost-control--budgeting)
- [Student Credits & Discounts](#student-credits--discounts)

### Part 6: Implementation Guide
- [Phase 1: AWS Account & RDS Setup](#phase-1-aws-account--rds-setup)
- [Phase 2: Lambda Function Refactoring](#phase-2-lambda-function-refactoring)
- [Phase 3: Deploy to AWS](#phase-3-deploy-to-aws)
- [Phase 4: Frontend Integration](#phase-4-frontend-integration)
- [Phase 5: Deploy Frontend to S3 + CloudFront](#phase-5-deploy-frontend-to-s3--cloudfront)
- [Testing Checklist](#testing-checklist)
- [Remediation Action Items](#remediation-action-items)

---

## PART 1: EXECUTIVE SUMMARY & CURRENT STATE

### TL;DR: Quick Facts

**Current State:**
-  Docker deployment works but has critical issues
-  84KB dead code in bundle
-  Missing API endpoints (logout, profile)
-  Zero test coverage
-  No rate limiting (brute force vulnerability)
-  Two UI frameworks competing (Bootstrap + Tailwind)
-  Good authentication foundation (bcrypt, JWT)
-  Safe database queries (parameterized)

**AWS Migration:**
-  Essentially FREE for university projects (Year 1: $1.20/month)
-  Much simpler infrastructure (AWS manages everything)
-  Better scalability (from 1 to 1 million concurrent users)
-  Production-ready monitoring (CloudWatch)
- ⏱️ 2-3 weeks to fully migrate

**Your Path:**
1. Implement missing endpoints (1 hour)
2. Delete dead code (30 min)
3. Set up RDS (15 minutes active)
4. Convert API routes to Lambda (4-6 hours)
5. Deploy with SAM (1-2 hours)
6. Test and iterate (3-4 hours)

---

### Why Migrate to AWS?

| Factor | Docker | AWS |
|--------|--------|-----|
| **Cost** | $15-30/month | $1.20/month (Yr 1) |
| **Server Management** | You manage | AWS manages |
| **Auto-scaling** | Manual | Automatic |
| **Backups** | Manual | Automatic daily |
| **Monitoring** | Limited | CloudWatch included |
| **Time to Deploy** | ~15 minutes | ~5 minutes |
| **Production Ready** | Some gaps | Industry standard |

---

### Timeline & Effort

**Realistic breakdown:**

```
Week 1: Foundation
├─ Day 1: AWS Account + RDS setup (3-4 hours)
├─ Day 2-3: Convert API routes to Lambda (6-8 hours)
└─ Total: ~12 hours

Week 2: Deployment
├─ Day 4: Deploy Lambda functions (2-3 hours)
├─ Day 5: Deploy frontend to S3 (1-2 hours)
└─ Total: ~5 hours

Week 3: Testing & Polish
├─ Day 6-7: End-to-end testing & fixes (4-6 hours)
└─ Total: ~6 hours

TOTAL EFFORT: 20-30 hours (over 3 weeks)
```

---

### Cost Overview

**Year 1 (Free Tier):**
```
Lambda:             $0 (1M requests free)
API Gateway:        $0 (1M calls free)
RDS:                $0 (free tier eligible)
S3:                 $0 (5GB free)
CloudFront:         $0 (1TB free)
Secrets Manager:    $1.20 (unavoidable)
CloudWatch:         $0 (free tier)
────────────────────────────
TOTAL: $1.20/month = $14.40/year
```

**Year 2+ (Paid Services):**
```
Adds RDS: ~$12/month for db.t3.micro
Total: ~$20/month = $240/year
```

**With AWS Educate Credits:**
```
$100-150 free credits + free tier
= 2-3 years of completely free service
```

---

## PART 2: CURRENT CODEBASE ANALYSIS

### Critical Issues Found

**Overall Rating: 4/10** - Early stage, fixable, but significant gaps

| Issue | Severity | Impact | Status |
|-------|----------|--------|--------|
| Missing `/api/auth/logout` |  CRITICAL | Logout doesn't work | Not implemented |
| Missing `/api/auth/me` |  CRITICAL | Can't fetch user profile | Not implemented |
| No rate limiting |  CRITICAL | Brute force vulnerability | Not implemented |
| Zero test coverage |  CRITICAL | No validation of code | Not implemented |
| 84KB dead code |  HIGH | Bundle bloat, perf impact | 4 unused components |
| Two UI frameworks |  HIGH | Massive CSS duplication | Bootstrap + Tailwind |
| No CSRF protection |  HIGH | XSS/CSRF vulnerability | Not implemented |
| No security headers |  HIGH | Clickjacking risk | Not implemented |
| No account lockout |  HIGH | Brute force possible | Not implemented |
| AuthContext unused |  MEDIUM | Dead code | Created but never used |

---

### Security Vulnerabilities

#### SQL Injection:  SAFE
All queries use parameterized format:
```javascript
// Safe - parameters escaped
const users = await db`SELECT * FROM login WHERE email = ${email}`
```

#### CSRF Protection:  MISSING
- No CSRF tokens on state-changing endpoints
- No double-submit cookie pattern
- **Action Required:** Implement CSRF validation before production

#### Missing Security Headers
- No `Content-Security-Policy`
- No `X-Frame-Options`
- No `X-Content-Type-Options`
- **Action Required:** Add middleware in CloudFront/Lambda

#### Authentication Gaps

**Missing Endpoints:**
```
 POST /api/auth/logout - Called but doesn't exist
 GET /api/auth/me - Called but doesn't exist
 POST /api/auth/refresh - No token refresh
 Missing: Account lockout after 5 failed attempts
 Missing: Password reset flow
 Missing: Email verification
```

**JWT Configuration:**  ACCEPTABLE
- Secret validation enforced
- Token expiry: 1 day (reasonable)
- Algorithm: HS256 (secure)

#### Cookie Security:  GOOD
- HttpOnly flag present (prevents XSS theft)
- Secure flag set (HTTPS only)
- SameSite: 'lax' (could be 'strict')

---

### Database Design

#### Current Schema
```sql
CREATE TABLE login (
  user_id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  hashed_password TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_login_email ON public.login(email);
```

#### Issues Found

| Issue | Severity | Fix |
|-------|----------|-----|
| No soft delete flag | Medium | Add `is_deleted BOOLEAN DEFAULT FALSE` |
| No password reset tokens | High | Add `reset_token`, `reset_token_expiry` |
| No email verification | Medium | Add `email_verified`, `email_token` |
| No account lockout tracking | High | Add `failed_attempts`, `locked_until` |
| No last login tracking | Low | Add `last_login TIMESTAMPTZ` |

#### Indexing:  ADEQUATE
- Email index present (correct for lookups)
- No N+1 query patterns detected

---

### Performance Bottlenecks

#### Bundle Size Issue
**Two CSS frameworks loaded:**
```
Bootstrap CSS/JS: ~200KB
Tailwind CSS: ~30KB (unoptimized)
Total: ~230KB unnecessary
```

**Unused Components:**
```
LandingPage.jsx:      38KB (not imported)
CalendarMonthly.jsx:  22KB (not imported)
Template components:  24KB (duplicate, unused)
Total dead code:      84KB
```

**Action:** Delete all 4 components → Reduce bundle 84KB

#### Database Connections
- No connection pooling configured
- Each Lambda will create new connection
- **Solution:** Use RDS Proxy (AWS managed)

#### Frontend Optimization
- No component lazy loading
- No image optimization
- No response caching headers

---

### Over-engineering Problems

#### Monorepo for Single App
```
Current:
socsboard/
├── apps/
│   ├── recommender/ (empty)
│   └── web/ (actual app)
├── packages/ (empty)
└── pnpm-workspace.yaml (but using npm!)

Should be:
socsboard/
├── src/
├── database/
└── docs/
```

#### Tool Confusion
- `pnpm-lock.yaml` exists but project uses `npm`
- Wastes space, confuses developers
- **Action:** Delete pnpm files, use npm only

#### Dependency Bloat
```
Installed:
@headlessui/react    - Unused (in LandingPage)
@heroicons/react     - Unused (in LandingPage)
bootstrap            - Kept (in use)
tailwindcss          - Remove (duplicate UI framework)

After cleanup: Remove 3 packages
```

---

### Missing Features & API Gaps

#### Implemented Endpoints: 3/7
```
 POST /api/auth/login       - Working
 POST /api/auth/register    - Working
 GET /api/health            - Working

 POST /api/auth/logout      - Not implemented
 GET /api/auth/me           - Not implemented
 POST /api/auth/refresh     - Not implemented
 User profile endpoints     - Not started
```

#### API Response Inconsistencies
```javascript
// Different response formats
{ success: true, user: {...} }        // login
{ status: 'ok', database: {...} }     // health
{ error: 'Invalid credentials' }      // error
```

**Fix:** Use consistent wrapper for all responses

#### Called but Not Implemented
```javascript
// src/lib/apiClient.js
logout()    // Line 202: calls /api/auth/logout (doesn't exist)
getMeUser() // Line 210: calls /api/auth/me (doesn't exist)
```

---

### Testing Gaps

#### Current Coverage: 0%
- No test files found
- No jest.config.js
- No CI/CD pipeline
- No pre-commit hooks

**This is unacceptable for a software engineering project.**

#### Tests Needed
| Component | Type | Priority |
|-----------|------|----------|
| validation.js | Unit | High |
| auth.js | Unit | High |
| /api/auth/login | Integration | High |
| /api/auth/register | Integration | High |
| Password hashing | Unit | High |
| JWT token lifecycle | Unit | Medium |
| SQL injection attempts | Security | High |
| Rate limiting | Integration | High |

**Estimate:** 15-20 tests = 4-6 hours

---

## PART 3: SERVICE-BY-SERVICE BREAKDOWN

### Compute: Docker → AWS Lambda

#### Current Setup
```
Docker Container (always running)
├─ Next.js server on port 3000
├─ Handles all HTTP requests
├─ Database connections persistent
└─ Running 24/7 whether used or not
```

#### What Changes

**Code Format:**
```javascript
// BEFORE (Next.js)
export async function POST(request) {
  const body = await request.json();
  return Response.json({ success: true });
}

// AFTER (Lambda)
export const handler = async (event) => {
  const body = JSON.parse(event.body);
  return {
    statusCode: 200,
    body: JSON.stringify({ success: true })
  };
};
```

**Key Differences:**
| Aspect | Docker | Lambda |
|--------|--------|--------|
| Always running | ✓ 24/7 | ✗ On-demand |
| Input object | `Request` object | `event` object |
| Output format | `Response.json()` | `{ statusCode, body }` |
| Connection reuse | ✓ Persistent | ✗ Per-request |
| Cold start | N/A | ~500ms first call |
| Cost model | Hourly | Per-request |

**Files to Move:**
```
FROM:                                TO:
src/app/api/auth/login/route.js    → src/lambdas/auth/login.js
src/app/api/auth/register/route.js → src/lambdas/auth/register.js
src/app/api/auth/logout/route.js   → src/lambdas/auth/logout.js (new)
src/app/api/auth/me/route.js       → src/lambdas/auth/me.js (new)
```

**New Directory Structure:**
```
src/lambdas/
├── auth/
│   ├── login.js
│   ├── register.js
│   ├── logout.js
│   └── me.js
├── shared/
│   ├── database.js
│   ├── auth.js
│   └── validation.js
└── utils/
    ├── response.js
    ├── secrets.js
    └── logger.js
```

---

### API: Next.js Routes → API Gateway

#### Current Setup
```
Browser request to /api/auth/login
    ↓
Cloudflare Tunnel
    ↓
Next.js Router (automatic routing)
    ↓
File: src/app/api/auth/login/route.js
    ↓
POST function executes
```

#### What Changes

**Routing Definition:**
```javascript
// BEFORE: File structure = routing
src/app/api/auth/login/route.js

// AFTER: Template defines routing
template.yaml (defines all routes)
src/lambdas/auth/login.js (just logic)
```

**API Gateway Routing (SAM Template):**
```yaml
Resources:
  SocsboardAPI:
    Type: AWS::Serverless::Api
    Properties:
      StageName: dev
      Cors:
        AllowMethods: "'GET,POST,OPTIONS'"
        AllowOrigin: "'*'"

  LoginFunction:
    Type: AWS::Serverless::Function
    Properties:
      Events:
        PostLogin:
          Type: Api
          Properties:
            Path: /auth/login
            Method: POST
            RestApiId: !Ref SocsboardAPI
```

**URL Changes:**
```
BEFORE: https://your-domain.com/api/auth/login
AFTER:  https://xxxxx.execute-api.us-east-1.amazonaws.com/dev/auth/login
        (or custom domain with Route53)
```

**Files Affected:**
```
DELETED:
  src/app/api/ (all files move to Lambda)

NEW:
  template.yaml (defines all routes)

MODIFIED:
  src/lib/apiClient.js (update endpoint URLs)
```

---

### Database: Local PostgreSQL → AWS RDS

#### Current Setup
```
Docker Backend → PostgreSQL on Tailscale VPN
                 100.118.61.122:2345
```

#### What Changes

**Connection String:**
```javascript
// BEFORE: From environment
postgresql://<redacted>

// AFTER: From AWS Secrets Manager
const secrets = await getSecret('socsboard/rds-credentials');
postgresql://<redacted>
  socsboard-db.xxxxx.us-east-1.rds.amazonaws.com:5432/socsboard
```

**What Stays the Same:**
- Table schema (login table unchanged)
- Data format (PostgreSQL to PostgreSQL)
- Query syntax (same SQL)
- User data (migrated as-is)

**What You Get (AWS Managed):**
- Automatic daily backups
- Automatic security updates
- Multi-AZ failover (optional)
- Read replicas (optional)
- Automatic scaling (optional)

**Setup Process:**
1. Create RDS instance (15 min active + 5-10 min wait)
2. Get hostname: `socsboard-db.xxxxx.us-east-1.rds.amazonaws.com`
3. Run schema: `psql ... < database/schema.sql`
4. Store credentials in Secrets Manager
5. Update Lambda code to fetch from Secrets Manager

**Connection Pooling:**
```
BEFORE: Persistent connection
Lambda Request → Reuses connection → Efficient

AFTER: Per-request connection
Lambda Request → Creates connection → Closes → Next request creates new

SOLUTION: Use RDS Proxy (AWS managed connection pooling)
Lambda → RDS Proxy → RDS (handles connection reuse)
```

---

### Frontend: Docker Server → S3 + CloudFront

#### Current Setup
```
Browser → Cloudflare Tunnel → Docker Container (Next.js)
                               ├─ Serves HTML
                               ├─ Serves JS/CSS
                               └─ Can handle API requests too
```

#### What Changes

**Build Process:**
```javascript
// BEFORE: Dynamic server
npm run dev
npm run build (still runs server)

// AFTER: Static export
npm run build
npm run export (if separate)
// Creates: out/ folder with static HTML/JS/CSS
```

**next.config.js:**
```javascript
// Add to next.config.js:
export const config = {
  output: 'export',        // Build to static
  images: {
    unoptimized: true,     // S3 can't optimize
  },
};
```

**File Serving:**
```
BEFORE:
src/app/layout.js
src/app/login/page.js
  ↓ (Built by Next.js)
.next/ folder
  ↓ (Served by Docker)
Browser

AFTER:
src/app/layout.js
src/app/login/page.js
  ↓ (Built by Next.js export)
out/ folder (static files)
  ↓ (Uploaded to S3)
S3 bucket
  ↓ (Served by CloudFront CDN)
Browser (with caching)
```

**Output Structure:**
```
out/
├── index.html          (from layout.js)
├── login/index.html    (from login/page.js)
├── register/index.html (from register/page.js)
├── _next/              (JavaScript bundles)
└── [static files]
```

**CloudFront Benefits:**
- Global CDN (faster worldwide)
- Automatic caching
- Security headers at edge
- Compression included
- DDoS protection included

**Files Affected:**
```
DELETED:
  Dockerfile
  docker-compose.yml
  deploy.sh

MODIFIED:
  next.config.js (add export config)
  package.json (update build script)

NEW:
  S3 bucket (created in AWS)
  CloudFront distribution (created in AWS)
  s3-sync.sh (deployment script)
```

---

### Secrets: .env Files → AWS Secrets Manager

#### Current Setup
```
.env (local file)
├─ DATABASE_URL=postgresql://<redacted>
├─ JWT_SECRET=<redacted>
└─ NEXT_PUBLIC_API_URL=http://localhost:3000

 Problems:
  ├─ Visible in files
  ├─ Accidental commits possible
  ├─ No encryption
  └─ No audit trail
```

#### What Changes

**Storage:**
```javascript
// BEFORE: Read from file
const url = process.env.DATABASE_URL;

// AFTER: Fetch from AWS (encrypted)
import { SecretsManager } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManager();
const secret = await client.getSecretValue({
  SecretId: 'socsboard/rds-credentials'
});
const dbConfig = JSON.parse(secret.SecretString);
```

**Setup:**
```bash
# Create secret
aws secretsmanager create-secret \
  --name socsboard/rds-credentials \
  --secret-string '{
    "host": "socsboard-db.xxxxx.us-east-1.rds.amazonaws.com",
    "username": "socsboard_user",
    "password": "secure-password",
    "database": "socsboard"
  }'

aws secretsmanager create-secret \
  --name socsboard/jwt-secret \
  --secret-string "your-random-32-char-secret"
```

**Benefits:**
- Encrypted at rest & in transit
- Audit trail (who accessed what)
- Automatic rotation (optional)
- No files to manage
- Accessible from Lambda securely

**Files Affected:**
```
DELETED:
  .env (no longer needed)
  .env.production (replaced by Secrets Manager)

NEW:
  AWS Secrets Manager (cloud service)
  src/lambdas/utils/secrets.js (retrieval logic)

MODIFIED:
  Lambda functions (call getSecret instead of process.env)
```

**Cost Note:**
```
Secrets Manager: $0.40/secret/month (no free tier)
3 secrets = $1.20/month = $14.40/year
This cost is unavoidable but acceptable.

Alternative: Use Parameter Store (free but less secure)
Recommendation: Pay for Secrets Manager (better security)
```

---

### Logging: Console → CloudWatch

#### Current Setup
```
Docker Container
├─ console.log() output
├─ Printed to STDOUT
├─ Visible in docker logs
└─ Lost when container restarts
```

#### What Changes

**Automatic Capture:**
```javascript
// BEFORE: Logs lost after container restart
console.log('User login:', email);

// AFTER: Automatically in CloudWatch
// Same code, but logs persist permanently
console.log('User login:', email);

// View with:
aws logs tail /aws/lambda/socsboard-login --follow
```

**CloudWatch Features:**
```
Lambda Functions
    ↓ (automatic)
CloudWatch Logs
    ├─ Log Groups (/aws/lambda/function-name)
    ├─ Log Streams (one per invocation)
    ├─ Permanent storage (configurable retention)
    ├─ Search & filtering (CloudWatch Insights)
    ├─ Metrics (errors, duration, etc.)
    └─ Alarms (notify you of problems)
```

**Cost:**
```
Free Tier:
├─ Logs stored for 7 days: free
├─ 5 GB ingestion/month: free
└─ 10 alarms: free

Typical project:
├─ ~50 MB/month of logs
├─ Well within free tier
└─ Cost: $0/month
```

**Files Affected:**
```
MODIFIED:
  src/lambdas/auth/*.js
  ├─ console.log stays (CloudWatch captures)
  ├─ Can add structured logging
  └─ No file changes needed

NEW:
  CloudWatch Logs (AWS service)
  CloudWatch Dashboards (optional monitoring)
```

---

## PART 4: AWS STRATEGY & ARCHITECTURE

### Architecture Overview

#### Current (Docker)
```
User Browser
    ↓
Cloudflare Tunnel
    ↓
Docker Container (port 3000)
├─ Next.js Server
├─ API routes
└─ Static files serving
    ↓
PostgreSQL (Tailscale VPN)
```

#### AWS Serverless
```
User Browser (HTTPS)
    ↓
CloudFront CDN (caching, security)
    ├─ Static assets (S3 backed)
    │  ├─ HTML/JS/CSS
    │  └─ Cached globally
    │
    └─ API Requests → API Gateway
           ↓
        Lambda Functions (Lambda: Compute)
        ├─ socsboard-login
        ├─ socsboard-register
        ├─ socsboard-logout
        └─ socsboard-me
           ↓
        RDS PostgreSQL (AWS managed DB)
           ↓
        Secrets Manager (encrypted config)

Support Services:
├─ CloudWatch (logs, monitoring, alarms)
├─ DynamoDB (sessions, optional)
├─ IAM (permissions)
└─ Secrets Manager (credentials)
```

---

### AWS Service Mapping

#### Compute Layer
| Current | AWS Service | What Happens |
|---------|-------------|--------------|
| Docker Container | Lambda | Serverless functions, on-demand execution |
| Port 3000 server | API Gateway | HTTP routing, CORS handling |
| Always running | Event-driven | Only runs when invoked |

#### Storage & Content
| Current | AWS Service | What Happens |
|---------|-------------|--------------|
| Docker disk | S3 bucket | Cloud storage, static files |
| Cloudflare Tunnel | CloudFront | CDN, caching, compression |
| Local filesystem | S3 buckets | No filesystem, use cloud storage |

#### Database
| Current | AWS Service | What Happens |
|---------|-------------|--------------|
| PostgreSQL (Tailscale) | RDS PostgreSQL | AWS managed, automatic backups |
| Manual backups | AWS Backups | Automatic daily backups |
| Connection management | RDS Proxy | Connection pooling (optional) |

#### Configuration & Secrets
| Current | AWS Service | What Happens |
|---------|-------------|--------------|
| .env files | Secrets Manager | Encrypted cloud storage |
| process.env | SDK retrieval | Fetch at runtime from AWS |
| No encryption | AES-256 encryption | All secrets encrypted |

#### Monitoring & Logging
| Current | AWS Service | What Happens |
|---------|-------------|--------------|
| console.log | CloudWatch Logs | Permanent cloud logging |
| docker logs | Log groups | Organized by function |
| No monitoring | CloudWatch Metrics | Automatic metrics & alarms |

---

### Revised Priorities for AWS

#### What Changes with AWS Migration

**Issues That Disappear 🎉**
```
 Docker configuration      → AWS handles containerization
 Monorepo structure        → Lambda functions self-contained
 In-memory rate limiting   → AWS WAF or DynamoDB
 In-memory account lockout → DynamoDB for persistence
 Health checks             → ALB handles this
 Local env setup           → Secrets Manager
 Manual deployment         → SAM or AWS Console
```

**Issues That Become MORE Critical ⚠️**
```
 Missing API endpoints     → Still critical (logout, me)
 Dead code                 → Increases Lambda bundle size
 API design                → Must match API Gateway format
 Error handling            → Lambda-specific requirements
 Code format transformation → Next.js → Lambda handler
```

**Issues That Stay Important ✓**
```
✓ CSRF protection        → Still needed in API
✓ SQL injection          → RDS still a database
✓ Password hashing       → Still needed for JWT
✓ Database schema        → Same schema, different location
✓ Authentication design  → Can keep JWT or use Cognito
```

#### New Priorities for AWS Deployment

**Phase 1: Foundation (Days 1-3)**
```
1. Implement missing API endpoints (1 hour)
   └─ /api/auth/logout, /api/auth/me, /api/auth/refresh

2. Delete dead code (30 minutes)
   └─ 84KB unused components

3. Set up RDS PostgreSQL (30 minutes active + wait)
   └─ Create instance, migrate schema

4. Store credentials in Secrets Manager (15 minutes)
   └─ Database URL, JWT secret

5. Restructure for Lambda (4-6 hours)
   └─ Convert Next.js routes to Lambda handlers
```

**Phase 2: Infrastructure (Days 3-5)**
```
1. Create API Gateway (1 hour)
2. Create Lambda functions (2 hours)
3. Deploy with SAM (1 hour)
4. Test API endpoints (1 hour)
```

**Phase 3: Frontend (Days 5-7)**
```
1. Configure Next.js for static export (15 minutes)
2. Build static site (2 minutes)
3. Create S3 bucket (5 minutes)
4. Create CloudFront distribution (15 minutes)
5. Deploy frontend (1 minute via aws s3 sync)
6. Test end-to-end (1-2 hours)
```

---

### Migration Timeline

#### Week 1: Setup & Database

**Monday-Tuesday (Days 1-2): AWS Account & Database**
```
9:00 AM: Create AWS account (15 min)
9:30 AM: Create RDS instance (5 min active + 10 min wait)
10:00 AM: Migrate schema (15 min)
10:30 AM: Create Secrets Manager entries (10 min)
11:00 AM: Test database connection (15 min)
─────────────────────────────────
Total: ~1.5 hours active, plus waiting

Deliverable: Working RDS database with schema
```

**Wednesday-Thursday (Days 3-4): Lambda Refactoring**
```
Convert API routes to Lambda:
├─ Create handler for login (1 hour)
├─ Create handler for register (1 hour)
├─ Create handler for logout (30 min)
├─ Create handler for me (30 min)
├─ Create shared utilities (1 hour)
├─ Create SAM template (1 hour)
└─ Test locally with sam local (1 hour)
─────────────────────────────────
Total: ~6 hours

Deliverable: Lambda functions ready for deployment
```

**Friday (Day 5): Initial Deploy**
```
9:00 AM: Build with SAM (2 min)
9:15 AM: Deploy with SAM (5 min + waiting)
10:00 AM: Test API endpoints (1 hour)
11:00 AM: Fix issues (1-2 hours)
─────────────────────────────────
Total: ~3 hours

Deliverable: Working API Gateway + Lambda
```

#### Week 2: Frontend & Integration

**Monday (Day 6): Frontend Build & Deploy**
```
9:00 AM: Update next.config.js (10 min)
9:15 AM: Build Next.js (2 min)
9:20 AM: Create S3 bucket (5 min)
9:30 AM: Create CloudFront (15 min + 10 min wait)
10:00 AM: Upload to S3 (1 min)
10:05 AM: Test frontend loading (30 min)
─────────────────────────────────
Total: ~1.5 hours

Deliverable: Frontend live on CloudFront
```

**Tuesday (Day 7): Integration**
```
9:00 AM: Update API endpoint URLs (15 min)
9:20 AM: Test login flow (30 min)
10:00 AM: Test register flow (30 min)
10:30 AM: Fix CORS if needed (30 min)
11:00 AM: Test error scenarios (1 hour)
─────────────────────────────────
Total: ~3 hours

Deliverable: End-to-end working app
```

**Wednesday-Friday (Days 8-10): Testing & Polish**
```
├─ Add CloudWatch dashboards (30 min)
├─ Set up cost alerts (15 min)
├─ Add security headers (30 min)
├─ Performance optimization (1 hour)
├─ Final testing (2 hours)
└─ Documentation (1 hour)
─────────────────────────────────
Total: ~5 hours

Deliverable: Production-ready deployment
```

#### Week 3+: Optimization & Features

**Optional Enhancements:**
```
├─ Add test coverage (3-4 hours)
├─ Add account lockout to Lambda (1 hour)
├─ Add rate limiting via AWS WAF (1 hour)
├─ Add Cognito authentication (4-6 hours)
├─ Set up CI/CD pipeline (2 hours)
└─ Performance optimization (2-3 hours)
```

**Total Realistic Timeline: 20-30 hours over 3 weeks**

---

## PART 5: COST ANALYSIS

### Free Tier Coverage

#### AWS Free Tier Types

**1. Always Free (No Expiration)**
```
Lambda:
├─ 1,000,000 requests/month (forever)
└─ 400,000 GB-seconds/month (forever)

DynamoDB:
├─ 25 GB storage (forever)
└─ 25 RCU (forever)

CloudWatch:
├─ 10 custom metrics (forever)
├─ 10 alarms (forever)
└─ 7-day log retention (forever)
```

**2. 12 Months Free (New Accounts)**
```
RDS PostgreSQL:
├─ db.t3.micro instance (12 months)
├─ 20 GB storage (12 months)
└─ Automated backups (12 months)

S3:
├─ 5 GB storage/month (12 months)
└─ Data transfer allowance (12 months)

API Gateway:
├─ 1 million API calls/month (12 months)
└─ Free tier data transfer (12 months)

CloudFront:
├─ 1 TB data transfer/month (12 months)
└─ 2 million requests/month (12 months)
```

**3. Monthly Free Allowance (No Expiration)**
```
Data Transfer Out:
├─ 100 GB/month (across all services)
└─ No expiration

CloudWatch Logs:
├─ 5 GB ingestion/month
└─ No expiration
```

---

### Cost by Scenario

#### Scenario 1: Light University Project (10-100 users)

**Usage Profile:**
- 10-100 requests/day = ~30k requests/month
- <5 GB storage
- Development/testing focused
- Low concurrent users

**Year 1 Cost (Free Tier):**
```
Lambda:           $0 (well within 1M free)
API Gateway:      $0 (well within 1M free)
RDS:              $0 (free tier eligible)
S3:               $0 (under 5 GB free)
CloudFront:       $0 (under 1 TB free)
Secrets Manager:  $1.20 (3 secrets × $0.40)
CloudWatch:       $0 (under 5GB logs free)
Data Transfer:    $0 (under 100 GB free)
────────────────────────────────
TOTAL:            $1.20/month = $14.40/year  ESSENTIALLY FREE
```

**Year 2+ Cost:**
```
Adds RDS: $12/month (db.t3.micro after free tier)
Total: ~$13.20/month
```

#### Scenario 2: Medium Project (100-1,000 users)

**Usage Profile:**
- 100-1,000 requests/day = ~100k requests/month
- 5-50 GB storage
- Regular class usage
- Moderate concurrent load

**Year 1 Cost:**
```
Lambda:           $0 (within free tier)
API Gateway:      $0 (within free tier)
RDS:              $0 (free tier)
S3:               $0.46 (20 GB × $0.023)
CloudFront:       $4.25 (50 GB × $0.085)
Secrets Manager:  $1.20
CloudWatch:       $0.50 (light logging)
Data Transfer:    $0 (within 100 GB free)
────────────────────────────────
TOTAL:            ~$6.40/month  CHEAP
```

**Year 2+ Cost:**
```
Adds RDS: $12/month
Total: ~$18/month
```

#### Scenario 3: Heavy Project (1,000+ users, high activity)

**Usage Profile:**
- 1,000+ requests/day = ~1M requests/month
- 50+ GB storage
- Active daily usage
- Regular load testing

**Year 1 Cost:**
```
Lambda:           $0.20 (1M requests)
API Gateway:      $3.50 (1M calls)
RDS:              $0 (free tier)
S3:               $2.30 (100 GB)
CloudFront:       $42.50 (500 GB)
Secrets Manager:  $1.20
CloudWatch:       $2.00 (heavy logging)
Data Transfer:    $0 (within free)
────────────────────────────────
TOTAL:            ~$51.70/month  OVER FREE TIER
```

**Year 2+ Cost:**
```
Total: ~$63.70/month (adds RDS)
```

**Note:** Most university projects fit Scenario 1 or 2

---

### Service-by-Service Pricing

#### Lambda Pricing
**Free Tier:**
- 1,000,000 requests/month (always)
- 400,000 GB-seconds/month (always)

**Typical University Project:**
```
30,000 requests/month
├─ Avg 512 MB, 1 second = 30k GB-seconds
├─ Within 400k GB-seconds ✓
└─ Cost: $0

After free tier:
├─ $0.0000002 per request
├─ $0.0000166667 per GB-second
├─ 1 million requests: $0.20
└─ Still very cheap
```

#### API Gateway Pricing
**Free Tier:**
- 1,000,000 API calls/month (12 months)
- Partial data transfer

**Typical University Project:**
```
30,000 calls/month
├─ Well within 1 million ✓
└─ Cost: $0

After free tier (year 2+):
├─ $3.50 per million API calls
├─ 300,000 calls = $1.05
└─ Still very cheap
```

#### RDS Pricing (db.t3.micro)
**Free Tier:**
```
db.t3.micro instance: free for 12 months
20 GB storage: free for 12 months
Automated backups: free for 12 months
```

**Year 1:**
```
Cost: $0 (free tier eligible)
```

**Year 2+ (After free tier expires):**
```
Instance: $0.016/hour = $11.68/month
Storage:  $0.10/GB × 5 GB = $0.50/month
────────────────────────────
Total:    ~$12/month

Option: Delete database when project ends = $0
```

**DO NOT UPGRADE TO:**
```
 db.t3.small: $0.034/hour = $24.82/month
 db.t3.medium: $0.068/hour = $49.64/month
✓ Stay on db.t3.micro for cost control
```

#### S3 Pricing
**Free Tier:**
```
5 GB storage/month (12 months)
20,000 GET requests/month
2,000 PUT requests/month
```

**Typical University Project:**
```
Next.js build: ~100-200 MB << 5 GB ✓
Requests: << free tier ✓
Cost: $0

After free tier (year 2+):
├─ Storage: $0.023/GB/month
├─ 100 MB app: $0.00
├─ Negligible cost
└─ Total: < $0.01/month
```

#### CloudFront Pricing
**Free Tier:**
```
1 TB data transfer OUT/month (12 months)
2 million requests/month (12 months)
```

**Typical University Project:**
```
100 users × 10 views/day × 100 KB = 100 MB/day = 3 GB/month
3 GB << 1 TB ✓
Cost: $0

After free tier (year 2+):
├─ $0.085/GB over 1 TB
├─ 3 GB/month: $0
├─ 50 GB/month: $4.25
├─ 500 GB/month: $42.50
└─ Depends on traffic
```

#### Secrets Manager Pricing
**NO Free Tier for storage:**
```
Each secret: $0.40/month
API calls: Free first 10,000, then $0.05/10k

Typical Setup:
├─ socsboard/rds-credentials: $0.40
├─ socsboard/jwt-secret: $0.40
└─ Total: $1.20/month (unavoidable)
```

**Cost appears in Year 1 AND Year 2+** (no free tier)

**Alternative:** Parameter Store (free but less secure)
```
Recommendation: Pay for Secrets Manager
Cost: $14.40/year is worth better security
```

#### CloudWatch Pricing
**Always Free:**
```
10 custom metrics
10 alarms
7-day retention
```

**Free Tier (12 months):**
```
5 GB logs ingested/month
```

**Typical University Project:**
```
~50 MB/month of logs
Well within 5 GB free ✓
Cost: $0

After free tier:
├─ Ingestion: $0.50/GB
├─ Storage: $0.03/GB/month
├─ Typical: < $1/month
└─ Unless heavy logging
```

#### Data Transfer Pricing
**Free Tier (Overlaps all services):**
```
100 GB outbound/month (no expiration)
```

**What Counts:**
```
├─ Lambda responses
├─ API Gateway to frontend
├─ CloudFront to users
├─ S3 to CloudFront
└─ Database replication
```

**Typical University Project:**
```
100 users × 100 KB responses × 10 requests/day
= 100 MB/day = 3 GB/month << 100 GB ✓
Cost: $0
```

**After free tier:**
```
$0.09/GB
├─ 100 GB: $0
├─ 500 GB: $36
└─ 1 TB: $90
```

---

### Cost Control & Budgeting

#### Monitor Your Costs

**Option 1: AWS Console Billing Dashboard**
```
AWS Console → Billing → Billing Dashboard
├─ Current month estimate
├─ Month-to-date spend
├─ Service breakdown
└─ Check monthly
```

**Option 2: AWS CLI**
```bash
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost
```

**Option 3: Set Up Billing Alert**
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name aws-billing-alert \
  --alarm-description "Alert if bill exceeds $10" \
  --metric-name EstimatedCharges \
  --namespace AWS/Billing \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --statistic Maximum \
  --period 86400 \
  --alarm-actions arn:aws:sns:region:account:email
```

#### Stay Within Budget

**DO:**
```
✓ Keep Lambda requests < 1M/month
✓ Keep API Gateway calls < 1M/month
✓ Keep RDS as db.t3.micro
✓ Keep storage < 5 GB (year 1)
✓ Keep data transfer < 100 GB/month
✓ Delete RDS when project done
✓ Delete S3 buckets when done
```

**DON'T:**
```
✗ Upgrade RDS to larger instance
✗ Create multiple databases
✗ Enable expensive logging levels
✗ Use NAT Gateway (extra charge)
✗ Use multi-AZ (doubles cost)
✗ Create read replicas (costs money)
✗ Leave resources running after course ends
```

#### Cost Optimization Tips

**1. Use Reserved Capacity (if keeping running long-term)**
```
RDS Reserved Instance:
├─ db.t3.micro: ~$60/year (vs $140 on-demand)
├─ Savings: 57%
└─ Only if keeping >1 year
```

**2. Scheduled Scaling**
```
For class projects:
├─ Scale down nights/weekends
├─ Use Lambda only during class hours
├─ Pause RDS when not needed
```

**3. Delete Unused Resources**
```
When project ends:
├─ Delete Lambda functions
├─ Delete API Gateway
├─ Delete RDS database
├─ Delete S3 buckets
├─ Delete CloudFront distribution
└─ Delete Secrets Manager secrets
```

---

### Student Credits & Discounts

#### AWS Educate (For Students)

**What You Get:**
```
$100-150 AWS credits
├─ Expires: 1 year from activation
├─ Stacks on top of free tier
└─ For eligible schools only
```

**Sign Up:**
```
Visit: https://aws.amazon.com/education/awseducate/
1. Verify your school email
2. Confirm student status
3. Credits appear in account
4. Use for any AWS services
```

**Impact on Your Project:**
```
Year 1: Free Tier + $100-150 credits
├─ Free Tier: covers everything except Secrets Manager ($1.20/mo)
├─ Credits: $100-150 (more than enough)
└─ Total Year 1 Cost: $0 out of pocket ✓

Year 2: Credits might still be active
├─ Check credit balance
├─ Might have $20-50 left
└─ More free coverage
```

#### GitHub Student Developer Pack

**What You Get:**
```
$50-100 AWS credits
├─ In addition to free tier
├─ Requires GitHub Education account
└─ For eligible schools only
```

**Sign Up:**
```
Visit: https://education.github.com/
1. Link GitHub account
2. Verify student status
3. Get Developer Pack
4. AWS credits included
```

**Combined with AWS Educate:**
```
AWS Educate credits:  $100-150
GitHub Pack credits:  $50-100 (separate pool)
─────────────────────────────
Total available:      $150-250 in credits
```

#### How Credits Work

**Credit Application:**
```
AWS charges you:
1. First: Your free tier allowance
2. Then: Your credits (automatic)
3. Finally: Your credit card (if any)

For your project:
├─ Free tier covers most
├─ Credits cover Secrets Manager + overage
├─ Your card: $0 charge
```

**Tracking Credits:**
```
AWS Console → Billing → Credits
├─ View remaining balance
├─ Expiration date
├─ Amount used this month
└─ Renewal date
```

---

## PART 6: IMPLEMENTATION GUIDE

### Phase 1: AWS Account & RDS Setup

#### Step 1.1: Create AWS Account

**Time:** 30 minutes

```bash
# 1. Visit AWS website
https://aws.amazon.com/

# 2. Click "Create an AWS Account"

# 3. Enter details:
#    ├─ Email address (university email)
#    ├─ Password
#    ├─ Account name: "socsboard"
#    └─ Continue

# 4. Add contact information
#    ├─ Full name
#    ├─ Company (your university)
#    ├─ Country
#    └─ Address

# 5. Add payment method
#    └─ Credit card (required, won't charge for free tier)

# 6. Verify identity
#    └─ Phone verification (SMS)

# 7. Select support plan
#    └─ Basic (free)

# 8. Confirm creation
#    └─ Account ready
```

#### Step 1.2: Set Up Billing Alerts

**Time:** 10 minutes

```bash
# 1. AWS Console → Billing Dashboard
# 2. Click "Create a Budget"
# 3. Settings:
#    ├─ Budget type: Spending
#    ├─ Budget limit: $10/month
#    ├─ Alert when 50% and 100% reached
#    └─ Email: your-email@university.edu

# Verify in settings:
# AWS Console → Billing → Preferences
# ├─ Enable Free Tier Usage Alerts: YES
# └─ Enable Bill Alerts: YES
```

#### Step 1.3: Create RDS PostgreSQL Instance

**Time:** 15 minutes active + 5-10 minutes waiting

```bash
# 1. AWS Console → RDS → Create Database

# 2. Choose engine: PostgreSQL

# 3. Engine options:
#    ├─ Version: 15.x (latest available)
#    └─ Template: Free tier

# 4. Settings:
#    ├─ DB instance identifier: socsboard-db
#    ├─ Master username: socsboard_user
#    ├─ Master password: (generate strong password - SAVE IT!)
#    └─ Confirm password: (same)

# 5. Instance class:
#    ├─ DB instance class: db.t3.micro (free tier eligible)
#    └─ DON'T CHANGE THIS

# 6. Storage:
#    ├─ Storage type: General Purpose (SSD)
#    ├─ Allocated storage: 20 GB (free tier)
#    └─ Storage autoscaling: Disabled

# 7. Connectivity:
#    ├─ Public accessibility: Yes (for now)
#    ├─ VPC: Default VPC
#    └─ Security group: Create new (socsboard-db-sg)

# 8. Database options:
#    ├─ Initial database name: socsboard
#    └─ Backup retention: 7 days

# 9. Monitoring:
#    ├─ Enable Enhanced Monitoring: No
#    └─ Enable deletion protection: No

# 10. Additional options:
#     └─ Uncheck "Enable encryption" (optional for dev)

# 11. CREATE DATABASE
#     └─ Wait 5-10 minutes...

# Monitor progress:
# RDS → Databases → socsboard-db
# └─ Status changes from "Creating" to "Available"
```

#### Step 1.4: Get Database Connection Details

**Time:** 5 minutes

```bash
# AWS Console → RDS → Databases → socsboard-db

# Note these values:
ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier socsboard-db \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text)

echo "Endpoint: $ENDPOINT"
# Output: socsboard-db.xxxxx.us-east-1.rds.amazonaws.com

PORT=5432
USER=socsboard_user
PASSWORD="your-password"
DATABASE=socsboard

# Build connection string:
DATABASE_URL=<redacted>echo "DATABASE_URL: $DATABASE_URL"
```

#### Step 1.5: Verify Database Connection

**Time:** 5 minutes

```bash
# Install psql if needed:
# macOS: brew install postgresql
# Ubuntu: sudo apt install postgresql-client
# Windows: Download from postgresql.org

# Test connection:
psql postgresql://<redacted>
socsboard-db.xxxxx.us-east-1.rds.amazonaws.com:5432/socsboard

# You should see:
# socsboard=>

# Verify database exists:
\l

# Show tables (should be empty):
\dt

# Exit:
\q
```

#### Step 1.6: Migrate Database Schema

**Time:** 5 minutes

```bash
# Copy schema to RDS:
psql -h socsboard-db.xxxxx.us-east-1.rds.amazonaws.com \
     -U socsboard_user \
     -d socsboard \
     -f database/schema.sql

# Or paste schema directly:
cat database/schema.sql | psql -h ... -U ... -d ...

# Verify schema created:
psql -h socsboard-db.xxxxx.us-east-1.rds.amazonaws.com \
     -U socsboard_user \
     -d socsboard \
     -c "\dt"

# Output should show:
#         List of relations
# Schema |  Name  | Type  |     Owner
# ────────────────────────────────────
# public | login  | table | socsboard_user
```

#### Step 1.7: Create Secrets in Secrets Manager

**Time:** 15 minutes

```bash
# 1. Create RDS credentials secret:
aws secretsmanager create-secret \
  --name socsboard/rds-credentials \
  --description "RDS database credentials" \
  --region us-east-1 \
  --secret-string '{
    "host": "socsboard-db.xxxxx.us-east-1.rds.amazonaws.com",
    "port": 5432,
    "username": "socsboard_user",
    "password": "your-password",
    "database": "socsboard"
  }'

# Output:
# {
#   "ARN": "arn:aws:secretsmanager:...",
#   "Name": "socsboard/rds-credentials",
#   "VersionId": "..."
# }

# 2. Create JWT secret:
aws secretsmanager create-secret \
  --name socsboard/jwt-secret \
  --description "JWT signing key" \
  --region us-east-1 \
  --secret-string "your-random-32-character-secret-key-here"

# 3. Verify secrets created:
aws secretsmanager list-secrets --region us-east-1

# 4. Test retrieval:
aws secretsmanager get-secret-value \
  --secret-id socsboard/rds-credentials \
  --region us-east-1
```

---

### Phase 2: Lambda Function Refactoring

#### Step 2.1: Create Directory Structure

**Time:** 10 minutes

```bash
# Create Lambda directory structure:
mkdir -p src/lambdas/auth
mkdir -p src/lambdas/shared
mkdir -p src/lambdas/utils
mkdir -p layers/nodejs/node_modules

# Create shared database module:
cat > src/lambdas/shared/database.js << 'EOF'
import postgres from 'postgres';
import { getSecretValue } from '../utils/secrets.js';

let db = null;

export async function getDbConnection() {
  if (db) return db;

  try {
    const credentials = await getSecretValue('socsboard/rds-credentials');

    db = postgres({
      host: credentials.host,
      port: credentials.port,
      username: credentials.username,
      password: credentials.password,
      database: credentials.database,
      max: 10,
      idle_timeout: 30,
    });

    return db;
  } catch (error) {
    console.error('Database connection error:', error);
    throw new Error('Failed to connect to database');
  }
}

export async function closeDb() {
  if (db) {
    await db.end();
    db = null;
  }
}
EOF

# Create secrets utility:
cat > src/lambdas/utils/secrets.js << 'EOF'
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({ region: 'us-east-1' });
const cache = new Map();
const CACHE_TTL = 3600000; // 1 hour

export async function getSecretValue(secretName) {
  const cached = cache.get(secretName);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.value;
  }

  try {
    const command = new GetSecretValueCommand({ SecretId: secretName });
    const response = await client.send(command);
    const value = JSON.parse(response.SecretString);

    cache.set(secretName, { value, time: Date.now() });
    return value;
  } catch (error) {
    console.error('Secret retrieval error:', error);
    throw new Error(`Failed to retrieve secret: ${secretName}`);
  }
}
EOF

# Create response formatter:
cat > src/lambdas/utils/response.js << 'EOF'
export function successResponse(data, statusCode = 200) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    },
    body: JSON.stringify({
      success: true,
      data,
    }),
  };
}

export function errorResponse(message, statusCode = 400) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({
      success: false,
      error: message,
    }),
  };
}
EOF
```

#### Step 2.2: Create Login Lambda Function

**Time:** 45 minutes

```bash
cat > src/lambdas/auth/login.js << 'EOF'
import { getDbConnection } from '../shared/database.js';
import { getSecretValue } from '../utils/secrets.js';
import { successResponse, errorResponse } from '../utils/response.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

export const handler = async (event, context) => {
  console.log('Login request:', { email: event.body?.email });

  try {
    // Parse request
    const body = JSON.parse(event.body || '{}');
    const { email, password } = body;

    // Validate input
    if (!email || !password) {
      return errorResponse('Email and password required', 400);
    }

    // Get database connection
    const db = await getDbConnection();

    // Query user
    const users = await db`
      SELECT user_id, email, hashed_password
      FROM login
      WHERE email = ${email}
    `;

    if (users.length === 0) {
      return errorResponse('Invalid credentials', 401);
    }

    const user = users[0];

    // Verify password
    const isValid = await bcrypt.compare(password, user.hashed_password);
    if (!isValid) {
      return errorResponse('Invalid credentials', 401);
    }

    // Generate JWT
    const jwtSecret = await getSecretValue('socsboard/jwt-secret');
    const token = jwt.sign(
      { user_id: user.user_id, email: user.email },
      jwtSecret,
      { expiresIn: '1d' }
    );

    console.log('Login successful:', { user_id: user.user_id });

    return successResponse({
      user: {
        user_id: user.user_id,
        email: user.email,
      },
      token,
    });

  } catch (error) {
    console.error('Login error:', error);
    return errorResponse('Internal server error', 500);
  }
};
EOF
```

#### Step 2.3: Create Register Lambda Function

**Time:** 45 minutes

```bash
cat > src/lambdas/auth/register.js << 'EOF'
import { getDbConnection } from '../shared/database.js';
import { getSecretValue } from '../utils/secrets.js';
import { successResponse, errorResponse } from '../utils/response.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { isValidEmail, isValidPassword } from '../shared/validation.js';

export const handler = async (event, context) => {
  console.log('Register request:', { email: event.body?.email });

  try {
    const body = JSON.parse(event.body || '{}');
    const { email, password } = body;

    // Validate input
    if (!email || !password) {
      return errorResponse('Email and password required', 400);
    }

    if (!isValidEmail(email)) {
      return errorResponse('Invalid email format', 400);
    }

    if (!isValidPassword(password)) {
      return errorResponse('Password must be at least 8 characters', 400);
    }

    // Get database connection
    const db = await getDbConnection();

    // Check if user exists
    const existing = await db`
      SELECT user_id FROM login WHERE email = ${email}
    `;

    if (existing.length > 0) {
      return errorResponse('Email already registered', 409);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const result = await db`
      INSERT INTO login (email, hashed_password)
      VALUES (${email}, ${hashedPassword})
      RETURNING user_id, email
    `;

    const user = result[0];

    // Generate JWT
    const jwtSecret = await getSecretValue('socsboard/jwt-secret');
    const token = jwt.sign(
      { user_id: user.user_id, email: user.email },
      jwtSecret,
      { expiresIn: '1d' }
    );

    console.log('Registration successful:', { user_id: user.user_id });

    return successResponse(
      {
        user: {
          user_id: user.user_id,
          email: user.email,
        },
        token,
      },
      201
    );

  } catch (error) {
    console.error('Register error:', error);
    return errorResponse('Internal server error', 500);
  }
};
EOF
```

#### Step 2.4: Create Logout & Me Functions

**Time:** 30 minutes

```bash
# Logout function
cat > src/lambdas/auth/logout.js << 'EOF'
import { successResponse } from '../utils/response.js';

export const handler = async (event, context) => {
  console.log('Logout request');

  // Client handles token removal
  return successResponse({
    message: 'Logged out successfully'
  });
};
EOF

# Me function
cat > src/lambdas/auth/me.js << 'EOF'
import { getSecretValue } from '../utils/secrets.js';
import { successResponse, errorResponse } from '../utils/response.js';
import jwt from 'jsonwebtoken';

export const handler = async (event, context) => {
  try {
    // Get authorization header
    const authHeader = event.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');

    if (!token) {
      return errorResponse('No token provided', 401);
    }

    // Verify JWT
    const jwtSecret = await getSecretValue('socsboard/jwt-secret');
    const decoded = jwt.verify(token, jwtSecret);

    return successResponse({
      user: {
        user_id: decoded.user_id,
        email: decoded.email,
      }
    });

  } catch (error) {
    console.error('Auth verification error:', error);
    return errorResponse('Invalid token', 401);
  }
};
EOF
```

#### Step 2.5: Create SAM Template

**Time:** 1 hour

```bash
cat > template.yaml << 'EOF'
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2013-12-31
Description: Socsboard Serverless Application

Globals:
  Function:
    Timeout: 30
    MemorySize: 256
    Runtime: nodejs18.x
    Architectures:
      - x86_64
    Environment:
      Variables:
        NODE_ENV: production

Resources:
  # API Gateway
  SocsboardAPI:
    Type: AWS::Serverless::Api
    Properties:
      StageName: dev
      TracingEnabled: false
      Cors:
        AllowMethods: "'GET, POST, OPTIONS, DELETE, PUT'"
        AllowHeaders: "'Content-Type, Authorization'"
        AllowOrigin: "'*'"
        MaxAge: "'600'"

  # Login Function
  LoginFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: socsboard-login
      CodeUri: src/lambdas/auth/
      Handler: login.handler
      Description: User login endpoint
      Events:
        LoginAPI:
          Type: Api
          Properties:
            RestApiId: !Ref SocsboardAPI
            Path: /auth/login
            Method: POST
      Policies:
        - Statement:
            - Effect: Allow
              Action:
                - secretsmanager:GetSecretValue
              Resource:
                - !Sub 'arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:socsboard/*'

  # Register Function
  RegisterFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: socsboard-register
      CodeUri: src/lambdas/auth/
      Handler: register.handler
      Description: User registration endpoint
      Events:
        RegisterAPI:
          Type: Api
          Properties:
            RestApiId: !Ref SocsboardAPI
            Path: /auth/register
            Method: POST
      Policies:
        - Statement:
            - Effect: Allow
              Action:
                - secretsmanager:GetSecretValue
              Resource:
                - !Sub 'arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:socsboard/*'

  # Logout Function
  LogoutFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: socsboard-logout
      CodeUri: src/lambdas/auth/
      Handler: logout.handler
      Description: User logout endpoint
      Events:
        LogoutAPI:
          Type: Api
          Properties:
            RestApiId: !Ref SocsboardAPI
            Path: /auth/logout
            Method: POST

  # Me Function
  MeFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: socsboard-me
      CodeUri: src/lambdas/auth/
      Handler: me.handler
      Description: Get current user endpoint
      Events:
        MeAPI:
          Type: Api
          Properties:
            RestApiId: !Ref SocsboardAPI
            Path: /auth/me
            Method: GET
      Policies:
        - Statement:
            - Effect: Allow
              Action:
                - secretsmanager:GetSecretValue
              Resource:
                - !Sub 'arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:socsboard/*'

Outputs:
  SocsboardApiEndpoint:
    Description: "API Gateway endpoint URL"
    Value: !Sub 'https://${SocsboardAPI}.execute-api.${AWS::Region}.amazonaws.com/dev'

  LoginFunctionArn:
    Description: "Login Lambda Function ARN"
    Value: !GetAtt LoginFunction.Arn

  RegisterFunctionArn:
    Description: "Register Lambda Function ARN"
    Value: !GetAtt RegisterFunction.Arn
EOF
```

---

### Phase 3: Deploy to AWS

#### Step 3.1: Install SAM CLI

**Time:** 10 minutes

```bash
# Install SAM CLI:
# macOS:
brew install aws-sam-cli

# Ubuntu:
curl -fsSL https://raw.githubusercontent.com/aws/aws-sam-cli/master/installer/linux-install.sh | sudo bash

# Windows:
choco install aws-sam-cli

# Verify installation:
sam --version
# Output: SAM CLI, version 1.x.x
```

#### Step 3.2: Build Lambda Functions

**Time:** 5 minutes

```bash
# From project root:
sam build

# Output:
# Build Succeeded
# Built Artifacts  : .aws-sam/build
# Built Template   : .aws-sam/build/template.yaml

# This creates:
# .aws-sam/build/
# ├── SocsboardAPI/
# ├── LoginFunction/
# ├── RegisterFunction/
# ├── LogoutFunction/
# └── MeFunction/
```

#### Step 3.3: Deploy to AWS

**Time:** 15 minutes (first time, interactive)

```bash
# First deployment (interactive):
sam deploy --guided

# Answer prompts:
# Stack Name [sam-app]: socsboard-stack
# Region [us-east-1]: us-east-1 (press Enter)
# Confirm changes before deploy [y/N]: y
# Allow SAM CLI IAM role creation [Y/n]: y
# Save parameters to samconfig.toml [Y/n]: y
# SAM configuration environment [default]: default

# Deployment begins...
# This takes 2-5 minutes

# Output shows:
# ─────────────────────────────────────────────
# Outputs
# ─────────────────────────────────────────────
# Key                 Value
# SocsboardApiEndpoint https://xxxxx.execute-api.us-east-1.amazonaws.com/dev
# ─────────────────────────────────────────────

# SAVE THE ENDPOINT URL - you'll need it for frontend!
```

#### Step 3.4: Test API Endpoints

**Time:** 1 hour

```bash
# Save API endpoint:
API_URL="https://xxxxx.execute-api.us-east-1.amazonaws.com/dev"

# Test 1: Health check (not Lambda but API Gateway works)
curl -X OPTIONS $API_URL/auth/login
# Should return 200

# Test 2: Register new user
curl -X POST $API_URL/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123"
  }'

# Expected response:
# {
#   "success": true,
#   "data": {
#     "user": {
#       "user_id": 1,
#       "email": "test@example.com"
#     },
#     "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
#   }
# }

# Test 3: Login
TOKEN=$(curl -s -X POST $API_URL/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test2@example.com","password":"TestPassword123"}' \
  | jq -r '.data.token')

# Login
curl -X POST $API_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test2@example.com",
    "password": "TestPassword123"
  }'

# Test 4: Get current user
curl -X GET $API_URL/auth/me \
  -H "Authorization: Bearer $TOKEN"

# Should return user data if token valid

# Test 5: Logout
curl -X POST $API_URL/auth/logout \
  -H "Content-Type: application/json"

# Expected: 200 success response
```

#### Step 3.5: Subsequent Deployments

**Time:** 2-3 minutes

```bash
# After first deploy, use simpler command:
sam deploy

# Reads saved parameters from samconfig.toml
# Deploys updated code
# Much faster than first time
```

---

### Phase 4: Frontend Integration

#### Step 4.1: Update API Client

**Time:** 20 minutes

```bash
# Update src/lib/apiClient.js
cat > src/lib/apiClient.js << 'EOF'
// Update API endpoint to your API Gateway URL
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ||
  'https://xxxxx.execute-api.us-east-1.amazonaws.com/dev';

async function apiRequest(method, endpoint, body = null) {
  const url = `${API_BASE_URL}${endpoint}`;

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  // Add token if exists
  const token = typeof window !== 'undefined'
    ? localStorage.getItem('authToken')
    : null;

  if (token) {
    options.headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    return data.data;
  } catch (error) {
    console.error('API error:', error);
    throw error;
  }
}

export async function login(email, password) {
  return apiRequest('POST', '/auth/login', { email, password });
}

export async function register(email, password) {
  return apiRequest('POST', '/auth/register', { email, password });
}

export async function logout() {
  return apiRequest('POST', '/auth/logout');
}

export async function getMe() {
  return apiRequest('GET', '/auth/me');
}
EOF
```

#### Step 4.2: Configure Environment Variables

**Time:** 10 minutes

```bash
# Production .env
cat > .env.production << 'EOF'
NEXT_PUBLIC_API_URL=https://xxxxx.execute-api.us-east-1.amazonaws.com/dev
EOF

# Development .env
cat > .env.development << 'EOF'
NEXT_PUBLIC_API_URL=http://localhost:3000
EOF

# Local .env.local (for local testing)
cat > .env.local << 'EOF'
NEXT_PUBLIC_API_URL=https://xxxxx.execute-api.us-east-1.amazonaws.com/dev
EOF
```

#### Step 4.3: Test Login Flow

**Time:** 30 minutes

```bash
# Start local development:
npm run dev

# Open http://localhost:3000/login

# Test flow:
# 1. Enter email: test@example.com
# 2. Enter password: TestPassword123
# 3. Click Login
# 4. Should redirect to dashboard
# 5. Token should be in localStorage

# Debug in browser console:
localStorage.getItem('authToken')
# Should show JWT token

# Check network tab:
# POST request to API_URL/auth/login
# Response should have user + token
```

---

### Phase 5: Deploy Frontend to S3 + CloudFront

#### Step 5.1: Configure Next.js for Static Export

**Time:** 15 minutes

```bash
# Update next.config.js
cat > next.config.js << 'EOF'
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  // Add security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
EOF

# Update package.json build script
# Find "build" script and ensure it does static export
# Next.js 13+ does this automatically with output: 'export'
```

#### Step 5.2: Build Static Site

**Time:** 2 minutes

```bash
# Build Next.js
npm run build

# Creates:
# .next/ - build artifacts
# out/   - static export (if export configured)

# Verify output:
ls -la out/
# Should show:
# index.html
# login/index.html
# register/index.html
# _next/ (JavaScript bundles)
```

#### Step 5.3: Create S3 Bucket

**Time:** 5 minutes

```bash
# Create bucket (must be globally unique):
BUCKET_NAME="socsboard-frontend-$(date +%s)"

aws s3 mb s3://$BUCKET_NAME --region us-east-1

# Block public access (CloudFront will serve it)
aws s3api put-public-access-block \
  --bucket $BUCKET_NAME \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# Enable versioning:
aws s3api put-bucket-versioning \
  --bucket $BUCKET_NAME \
  --versioning-configuration Status=Enabled

# Enable static website hosting (optional):
aws s3 website s3://$BUCKET_NAME/ \
  --index-document index.html \
  --error-document 404.html
```

#### Step 5.4: Upload Frontend Files

**Time:** 1 minute

```bash
# Sync build output to S3:
aws s3 sync ./out/ s3://$BUCKET_NAME/ \
  --delete \
  --cache-control "public, max-age=3600" \
  --exclude ".git"

# Verify upload:
aws s3 ls s3://$BUCKET_NAME/ --recursive

# Should show all files from out/ directory
```

#### Step 5.5: Create CloudFront Distribution

**Time:** 15 minutes active + 10 minutes waiting

**Via AWS Console (simplest):**

```
1. AWS Console → CloudFront → Create distribution

2. Origin settings:
   ├─ Origin domain: Select S3 bucket
   ├─ S3 access: Recommend "OAI" (Origin Access Identity)
   └─ Click "Create new OAI"

3. Default cache behavior:
   ├─ Viewer protocol policy: Redirect HTTP to HTTPS
   ├─ Cache policy: CachingOptimized
   └─ Compress objects: Yes

4. Response headers policy:
   ├─ Create response headers policy
   ├─ Add X-Content-Type-Options: nosniff
   ├─ Add X-Frame-Options: DENY
   └─ Add X-XSS-Protection: 1; mode=block

5. Settings:
   ├─ Default root object: index.html
   └─ Comment: socsboard-frontend

6. CREATE DISTRIBUTION

7. Wait for deployment (5-10 minutes)
   Status will change from "Deploying" to "Enabled"

8. Note Domain Name:
   d1234567890.cloudfront.net
```

#### Step 5.6: Configure Custom Domain (Optional)

**Time:** 15 minutes

```bash
# If using Route 53 or external DNS:

# Get CloudFront domain:
CLOUDFRONT_DOMAIN=$(aws cloudfront list-distributions \
  --query 'DistributionList.Items[0].DomainName' \
  --output text)

echo $CLOUDFRONT_DOMAIN
# Output: d1234567890.cloudfront.net

# Create CNAME in Route 53 or your DNS:
# Name: your-domain.com (or your domain)
# Type: CNAME
# Value: d1234567890.cloudfront.net

# OR if using AWS CLI:
aws route53 change-resource-record-sets \
  --hosted-zone-id ZONE_ID \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "your-domain.com",
        "Type": "CNAME",
        "TTL": 300,
        "ResourceRecords": [{"Value": "'$CLOUDFRONT_DOMAIN'"}]
      }
    }]
  }'

# Test domain resolution:
nslookup your-domain.com
# Should resolve to CloudFront domain
```

#### Step 5.7: Test Frontend Loading

**Time:** 30 minutes

```bash
# Via CloudFront domain:
curl -I https://d1234567890.cloudfront.net/

# Should return 200 and show security headers

# Via custom domain (if configured):
curl -I https://your-domain.com/

# Open in browser:
# https://d1234567890.cloudfront.net/
# or
# https://your-domain.com/

# Check that:
# ✓ Page loads
# ✓ CSS/JS load correctly
# ✓ No CORS errors in console
# ✓ Login page displays
```

---

### Testing Checklist

#### Phase 1: Database ✓
- [ ] RDS instance created and running
- [ ] Database schema loaded
- [ ] Can connect with psql
- [ ] Secrets Manager has credentials
- [ ] Secrets Manager has JWT secret

#### Phase 2: Lambda & API Gateway ✓
- [ ] `sam build` succeeds
- [ ] `sam deploy` succeeds
- [ ] API Gateway endpoint created
- [ ] 4 Lambda functions deployed
- [ ] CloudWatch logs appear

#### Phase 3: API Testing ✓
- [ ] POST /auth/register returns 200
- [ ] New user created in database
- [ ] Response includes JWT token
- [ ] POST /auth/login returns 200
- [ ] Login returns JWT token
- [ ] GET /auth/me returns user (with auth)
- [ ] POST /auth/logout returns 200

#### Phase 4: Frontend Integration ✓
- [ ] `npm run build` succeeds
- [ ] API endpoint URL correct in .env
- [ ] Local dev server starts
- [ ] Login page loads
- [ ] Can register new user
- [ ] Can login with credentials
- [ ] Token stored in localStorage
- [ ] Can logout

#### Phase 5: CloudFront & S3 ✓
- [ ] S3 bucket created
- [ ] Frontend files uploaded
- [ ] CloudFront distribution created
- [ ] CloudFront domain loads page
- [ ] Custom domain resolves (if configured)
- [ ] HTTPS works
- [ ] Security headers present
- [ ] Pages cached properly

#### End-to-End ✓
- [ ] Open frontend in browser
- [ ] Click login
- [ ] Enter credentials from test register
- [ ] Login succeeds
- [ ] Redirected to dashboard
- [ ] Token visible in localStorage
- [ ] Can logout
- [ ] Session cleared

---

### Remediation Action Items

#### Critical Fixes (Before Deployment)

**1. Implement Missing Endpoints ✓**
   - Status: Covered in Phase 2
   - [ ] Implement `/api/auth/logout`
   - [ ] Implement `/api/auth/me`
   - [ ] Test both endpoints

**2. Delete Dead Code ✓**
   - [ ] Delete `src/components/LandingPage.jsx`
   - [ ] Delete `src/components/ui/CalendarMonthly.jsx`
   - [ ] Delete `src/components/auth/Register.jsx`
   - [ ] Delete `src/components/auth/SignIn.jsx`
   - [ ] Remove Tailwind CSS framework
   - [ ] Remove unused dependencies

**3. Lambda-Specific Fixes ✓**
   - [ ] Convert API routes to Lambda handlers
   - [ ] Update input/output format
   - [ ] Test locally with `sam local start-api`
   - [ ] Add error handling for Lambda

#### High Priority (Week 1-2)

**4. Security Hardening**
   - [ ] Add CSRF token validation
   - [ ] Add security headers (CloudFront)
   - [ ] Implement rate limiting (AWS WAF)
   - [ ] Add account lockout (Lambda)

**5. Monitoring & Logging**
   - [ ] Set up CloudWatch dashboards
   - [ ] Create billing alerts
   - [ ] Enable request logging
   - [ ] Add custom metrics

#### Medium Priority (Week 2-3)

**6. Testing**
   - [ ] Write unit tests (validation, auth)
   - [ ] Write integration tests (API)
   - [ ] Test error scenarios
   - [ ] Test edge cases

**7. Documentation**
   - [ ] Document API endpoints
   - [ ] Document deployment process
   - [ ] Document environment variables
   - [ ] Create runbook for troubleshooting

#### Optional (If Time Allows)

**8. Advanced Features**
   - [ ] Password reset flow
   - [ ] Email verification
   - [ ] Two-factor authentication
   - [ ] OAuth integration
   - [ ] Rate limiting per user
   - [ ] Audit logging

---

## CONCLUSION

You now have a complete AWS migration guide with:

1. **Current State Analysis** - What's wrong and why
2. **Service Breakdown** - Exactly what changes when moving to AWS
3. **AWS Strategy** - Why AWS is better, what you'll use
4. **Cost Analysis** - You'll pay ~$1.20/month (Year 1), essentially free with student credits
5. **Implementation Steps** - Detailed, copy-paste ready commands for each phase

**Timeline:** 20-30 hours over 3 weeks
**Cost:** FREE (Year 1 with free tier + student credits)
**Result:** Production-ready serverless application

**Start here:**
1. Create AWS account (15 min)
2. Create RDS instance (20 min + wait)
3. Implement missing API endpoints (1-2 hours)
4. Deploy first Lambda function (2-3 hours)
5. Deploy frontend (1-2 hours)

Good luck! 🚀
