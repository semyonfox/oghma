# Authentication Setup Guide

This document explains the custom authentication implementation and how to get it working locally.

## Quick Facts

- **Type**: Custom JWT + HTTP-only cookies (not Auth.js or NextAuth)
- **Database**: PostgreSQL required (single `public.login` table)
- **Session storage**: HTTP-only cookies (client cannot access)
- **Token format**: JWT signed with `JWT_SECRET`
- **Protected routes**: Middleware checks all `/notes`, `/api/*` routes

## ⚠️ Critical Issues (as of 2026-03-02)

### Issue #1: Middleware is not active

**Status**: `src/proxy.ts` is correctly written but **not loaded by Next.js** because:
- File is named `proxy.ts` instead of `middleware.ts`
- Function is named `proxy` instead of being the default export

**Impact**: All protected routes (`/notes`, `/api/notes`, `/settings`, etc.) are currently **completely unprotected**. Anyone can access them without logging in.

**Fix**: Rename file to `src/middleware.ts` and use default export. See "Fixing the Middleware" section below.

### Issue #2: Database is required

All authentication endpoints query `public.login` table directly. Without it, register/login will fail.

**Fix**: Follow "Local Development Setup" section below.

## Local Development Setup

### Prerequisites

- PostgreSQL 12 or later (local, Docker, or cloud)
- Node.js 18+
- `.env.local` file in project root

### Step 1: Set up PostgreSQL

**Using Docker (recommended):**
```bash
docker run -d \
  --name oghmanotes-db \
  -e POSTGRES_USER=notes_user \
  -e POSTGRES_PASSWORD=notes_password \
  -e POSTGRES_DB=oghmanotes \
  -p 5432:5432 \
  postgres:16-alpine
```

**Using local PostgreSQL:**
```bash
psql -U postgres -c "CREATE USER notes_user WITH PASSWORD 'notes_password';"
psql -U postgres -c "CREATE DATABASE oghmanotes OWNER notes_user;"
```

### Step 2: Create the login table

```bash
psql postgresql://notes_user:notes_password@localhost:5432/oghmanotes < database/schema.sql
```

Or run this SQL directly:
```sql
CREATE TABLE IF NOT EXISTS public.login (
  user_id        SERIAL PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  hashed_password TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_email ON public.login(email);
```

### Step 3: Configure environment

Create `.env.local`:

```env
DATABASE_URL=postgresql://notes_user:notes_password@localhost:5432/oghmanotes
JWT_SECRET=replace-me-with-32-random-hex-characters
NODE_ENV=development
NEXT_PUBLIC_API_URL=http://localhost:3000
```

To generate a secure JWT_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 4: Start dev server

```bash
npm run dev
# or
pnpm dev
```

### Step 5: Test authentication

1. Open `http://localhost:3000/register`
2. Create account: `test@example.com` / `Password123`
3. Check cookies: DevTools → Application → Cookies → `session`
4. Verify database: `SELECT * FROM public.login;`

## Fixing the Middleware Bug

### Current issue

- File: `src/proxy.ts` (non-standard name)
- Export: Named export `proxy` (Next.js expects default)
- Result: Not loaded by Next.js → routes unprotected

### Solution: Rename and re-export

```bash
# Step 1: Rename file
mv src/proxy.ts src/middleware.ts
```

Update `src/middleware.ts` to use default export:

```typescript
import { NextRequest, NextResponse } from 'next/server';

// Default export required by Next.js
export default async function middleware(request: NextRequest) {
    const session = request.cookies.get('session')?.value;

    if (!session) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    return NextResponse.next();
}

// Matcher configuration tells Next.js which routes to protect
export const config = {
    matcher: [
        '/dashboard/:path*',
        '/notes/:path*',
        '/upload/:path*',
        '/settings/:path*',
        '/trash/:path*',
        '/api/extract/:path*',
        '/api/notes/:path*',
        '/api/import-export/:path*',
        '/api/tree/:path*',
        '/api/trash/:path*',
        '/api/upload/:path*',
        '/api/settings/:path*',
    ]
};
```

Restart dev server. Now try accessing `/notes` while logged out—you should be redirected to `/login`.

## Authentication Flow

### Register (`POST /api/auth/register`)

1. Validate email format and password strength (min 8, uppercase, lowercase, number)
2. Check if user exists → 409 Conflict if duplicate email
3. Hash password with bcrypt (cost 10)
4. Insert new user into `public.login`
5. Generate JWT token with `user_id` and `email`
6. Set HTTP-only cookie named `session` (expires in 1 day)
7. Return `{ success: true, user: { user_id, email } }`

### Login (`POST /api/auth/login`)

1. Validate email/password format
2. Check if account is locked (after 5 failed attempts)
3. Check rate limit (max 5 attempts per 15 minutes)
4. Query database for user by email
5. Verify password with bcrypt
6. On failure: increment attempt counters → 429 if locked/rate-limited
7. On success: clear attempt counters, generate JWT, set cookie
8. Return `{ success: true, user: { user_id, email } }`

### Session validation

Every protected request includes the `session` cookie. Middleware checks for its presence and redirects to `/login` if missing.

For API routes that need to verify the token is valid (not just present), call `/api/auth/me`:

```javascript
const response = await fetch('/api/auth/me');
if (!response.ok) {
  // Token invalid or expired
  window.location.href = '/login';
}
```

### Logout (`POST /api/auth/logout`)

- Clears the `session` cookie
- Returns `{ success: true, message: "Logged out successfully" }`

## Database Schema

Only one table is required:

```sql
CREATE TABLE public.login (
  user_id         SERIAL PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  hashed_password TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_login_email ON public.login(email);
```

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | SERIAL | Primary key, auto-increment |
| `email` | TEXT | Unique constraint, used for login |
| `hashed_password` | TEXT | bcrypt hash (cost 10), never in plaintext |
| `created_at` | TIMESTAMPTZ | Timestamp of account creation |

## Security Notes

### What's implemented

- ✅ Password hashing with bcrypt (cost 10)
- ✅ Rate limiting (5 attempts per 15 minutes per email)
- ✅ Account lockout (30 minutes after 5 failed attempts)
- ✅ HTTP-only cookies (prevents XSS token theft)
- ✅ Secure flag on cookies (HTTPS only in production)
- ✅ SameSite=Lax on cookies (CSRF protection)

### What's missing (for production)

- ⚠️ JWT verification in middleware (currently only checks cookie presence)
- ⚠️ Refresh token rotation
- ⚠️ Password reset flow (endpoints exist but not implemented)
- ⚠️ Email verification
- ⚠️ Two-factor authentication
- ⚠️ CORS configuration for multi-domain scenarios

### Recommended improvements

For production use, add JWT validation to middleware:

```typescript
import { verifyJWTToken } from './lib/auth';

export default async function middleware(request: NextRequest) {
    const sessionCookie = request.cookies.get('session')?.value;

    if (!sessionCookie) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // Validate JWT signature and expiration
    const decoded = verifyJWTToken(sessionCookie);
    if (!decoded) {
        // Token invalid or expired
        const response = NextResponse.redirect(new URL('/login', request.url));
        response.cookies.delete('session');
        return response;
    }

    return NextResponse.next();
}
```

## Troubleshooting

### "PostgreSQL connection refused"

```
ERROR: connect ECONNREFUSED 127.0.0.1:5432
```

**Solutions:**
- Check PostgreSQL is running: `docker ps` (Docker) or `psql -U postgres` (local)
- Verify `DATABASE_URL` in `.env.local` is correct
- For Docker: wait ~10 seconds after starting container

### "Database does not exist"

```
FATAL: database "oghmanotes" does not exist
```

**Solution:** Run schema setup (Step 2 above):
```bash
psql postgresql://notes_user:notes_password@localhost:5432/oghmanotes < database/schema.sql
```

### "Duplicate key value violates unique constraint"

```
ERROR: duplicate key value violates unique constraint "login_email_key"
```

**Solution:** Email already registered. Try different email or delete old user:
```bash
psql postgresql://notes_user:notes_password@localhost:5432/oghmanotes \
  -c "DELETE FROM public.login WHERE email = 'test@example.com';"
```

### "Can register but can't access /notes"

Middleware bug is not yet fixed. Follow "Fixing the Middleware Bug" section above.

### "JWT_SECRET is not configured"

```
JWT_SECRET environment variable is not set.
```

**Solution:** Add to `.env.local`:
```env
JWT_SECRET=<32-character-hex-string>
```

Generate one:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Architecture Overview

```
User → Login form (src/app/login/page.js)
  ↓
  POST /api/auth/login
  ├─ Validate credentials
  ├─ Query public.login
  ├─ Verify password with bcrypt
  ├─ Generate JWT
  └─ Set session cookie
  ↓
Browser stores cookie automatically (HTTP-only)
  ↓
Future requests include cookie
  ↓
Middleware (src/middleware.ts) checks for session cookie
  ├─ If present → Allow request
  └─ If missing → Redirect to /login
```

## Files Involved

| File | Purpose |
|------|---------|
| `src/lib/auth.js` | JWT generation, cookie management, response formatting |
| `src/lib/validation.js` | Email/password validation, strength checking |
| `src/lib/rateLimit.js` | Login attempt throttling (5 per 15 min) |
| `src/lib/accountLockout.js` | Account locking after failed attempts |
| `src/app/api/auth/register/route.js` | Registration endpoint |
| `src/app/api/auth/login/route.js` | Login endpoint |
| `src/app/api/auth/logout/route.js` | Logout endpoint |
| `src/app/api/auth/me/route.js` | Current user endpoint |
| `src/middleware.ts` | **Should be** the middleware file (currently `src/proxy.ts`) |
| `src/database/pgsql.js` | PostgreSQL connection |
| `database/schema.sql` | Login table DDL |

## Questions?

- Check `.env.example` for all available configuration options
- See `src/lib/auth.js` for JWT implementation details
- See `src/lib/validation.js` for password requirements

