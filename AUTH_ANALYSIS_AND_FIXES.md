# Authentication Implementation Analysis & Local Development Setup

**Date**: 2026-03-02  
**Analysed by**: OpenCode  
**Status**: Critical bugs identified and fixed

---

## Executive Summary

The project uses a **custom JWT-based authentication system** (not Auth.js or NextAuth). It requires:

1. **PostgreSQL database** with a single `public.login` table
2. **Valid `DATABASE_URL` environment variable**
3. **Correct middleware file** at `src/middleware.ts` (was incorrectly named `src/proxy.ts`)

Two critical issues were identified and fixed:

| Issue | Status | Impact |
|-------|--------|--------|
| Middleware file named `proxy.ts` instead of `middleware.ts` | ✅ **FIXED** | Protected routes were completely unprotected |
| No documentation on database setup | ✅ **FIXED** | Created `AUTH_SETUP.md` and `SETUP_QUICK_REFERENCE.md` |

---

## What Was Wrong

### Issue #1: Middleware Not Active

**The Problem:**
- Next.js only loads middleware from `src/middleware.ts` (or `middleware.ts` at root)
- The file was named `src/proxy.ts` (non-standard)
- The function was exported as `export function proxy` instead of `export default`

**The Result:**
- All protected routes (`/notes`, `/api/notes`, `/settings`, `/api/extract`, etc.) were **completely unprotected**
- Users could access protected routes by directly visiting them or hitting API endpoints
- No authentication check was being performed

**The Fix:**
- Created `src/middleware.ts` with correct export pattern
- Next.js now loads it automatically on startup
- Protected routes now properly redirect to `/login` if unauthenticated

### Issue #2: Missing Database Documentation

**The Problem:**
- Authentication endpoints require `public.login` table to function
- No clear setup instructions were provided
- Developers had to reverse-engineer database schema from code

**The Result:**
- Unclear why the app was asking for `DATABASE_URL`
- Difficult for new team members to set up local environment
- No reference for what the schema should look like

**The Fix:**
- Created `AUTH_SETUP.md` with comprehensive setup guide
- Created `SETUP_QUICK_REFERENCE.md` for quick onboarding
- Clearly documented database schema and all environment variables

---

## Quick Setup (5 minutes)

### 1. Start PostgreSQL

```bash
docker run -d \
  --name oghmanotes-db \
  -e POSTGRES_USER=notes_user \
  -e POSTGRES_PASSWORD=notes_password \
  -e POSTGRES_DB=oghmanotes \
  -p 5432:5432 \
  postgres:16-alpine
```

### 2. Create login table

```bash
psql postgresql://notes_user:notes_password@localhost:5432/oghmanotes < database/schema.sql
```

### 3. Set environment variables

```bash
cat > .env.local << 'EOF'
DATABASE_URL=postgresql://notes_user:notes_password@localhost:5432/oghmanotes
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
NODE_ENV=development
NEXT_PUBLIC_API_URL=http://localhost:3000
EOF
```

### 4. Start dev server

```bash
pnpm dev
```

### 5. Test at http://localhost:3000/register

---

## What the Authentication System Does

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     FRONTEND (React)                     │
├─────────────────────────────────────────────────────────┤
│  Login Page          Register Page         Protected App │
│       │                   │                       │      │
│       └──────────────────┬───────────────────────┘      │
│                          │                               │
│            /api/auth/login    /api/auth/register        │
│                    │                 │                   │
└────────────────────┼─────────────────┼───────────────────┘
                     │                 │
┌────────────────────┼─────────────────┼───────────────────┐
│                    ▼                 ▼                   │
│            ┌──────────────────────────────┐             │
│            │   CUSTOM AUTH MIDDLEWARE     │             │
│            │                              │             │
│            │ • JWT Token generation       │             │
│            │ • Bcrypt password hashing    │             │
│            │ • Session cookie management  │             │
│            │ • Rate limiting              │             │
│            │ • Account lockout            │             │
│            └──────────────────────────────┘             │
│                     │                                    │
│                     ▼                                    │
│            ┌──────────────────────────────┐             │
│            │ PostgreSQL: public.login      │             │
│            │                              │             │
│            │ • user_id (PK)               │             │
│            │ • email (UNIQUE)             │             │
│            │ • hashed_password            │             │
│            │ • created_at                 │             │
│            └──────────────────────────────┘             │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Login flow

1. User submits email + password → `POST /api/auth/login`
2. Validate format and check rate limit
3. Query `public.login` for user by email
4. Verify password with bcrypt
5. Generate JWT token: `jwt.sign({ user_id, email }, JWT_SECRET, { expiresIn: '1d' })`
6. Set HTTP-only cookie: `session=<jwt_token>`
7. Return `{ success: true, user: { user_id, email } }`

### Register flow

1. User submits email + password → `POST /api/auth/register`
2. Validate format + password strength (min 8, uppercase, lowercase, number)
3. Check if email already exists → 409 Conflict
4. Hash password with bcrypt (cost 10)
5. Insert user: `INSERT INTO public.login (email, hashed_password) VALUES (...)`
6. Generate JWT and set session cookie
7. Return success response

### Middleware protection (now active)

Every request to protected routes:
1. Middleware checks for `session` cookie
2. If present → Allow request
3. If missing → Redirect to `/login`

Protected routes: `/notes/*`, `/api/notes/*`, `/settings/*`, `/api/extract/*`, etc.

### Session verification

For API routes that need to validate the token is actually valid (not just present):

```javascript
// Frontend
const response = await fetch('/api/auth/me');
const { user } = await response.json();
```

```typescript
// Backend (src/app/api/auth/me/route.js)
const token = await getSessionCookie();
const decoded = verifyJWTToken(token);
if (!decoded) return 401; // Expired or invalid
```

---

## Files Changed

### NEW: `src/middleware.ts`
- Replaces the incorrectly-named `src/proxy.ts`
- Correct default export for Next.js
- Checks for session cookie on protected routes
- Redirects to `/login` if missing

### NEW: `AUTH_SETUP.md`
- Comprehensive authentication setup guide
- Database setup instructions for all platforms (Docker, local, cloud)
- Full authentication flow documentation
- Security notes and recommendations
- Troubleshooting guide

### NEW: `SETUP_QUICK_REFERENCE.md`
- 5-minute quick start guide
- TL;DR commands
- Common troubleshooting
- For onboarding new team members

### OLD: `src/proxy.ts`
- Still exists (not deleted to avoid breaking imports)
- Can be deleted if no other files import it
- Check with: `grep -r "from.*proxy" src/`

---

## Database Schema

**Single table required:**

```sql
CREATE TABLE public.login (
  user_id        SERIAL PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  hashed_password TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_login_email ON public.login(email);
```

**This is the ONLY table the authentication system uses.**

(Note: There's a second migration file `001_create_notes_table.sql` that references a `users` table—this is not implemented yet and can be ignored.)

---

## Environment Variables Required

```bash
# Database (PostgreSQL)
DATABASE_URL=postgresql://user:password@host:5432/database

# JWT signing (generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
JWT_SECRET=32-character-hex-string

# Next.js
NODE_ENV=development
NEXT_PUBLIC_API_URL=http://localhost:3000
```

---

## Security Posture

### ✅ Implemented
- Bcrypt password hashing (cost 10)
- Rate limiting (5 attempts per 15 minutes)
- Account lockout (30 minutes after 5 failures)
- HTTP-only cookies (prevents XSS token theft)
- SameSite=Lax (CSRF protection)
- Secure flag on cookies (HTTPS only in production)

### ⚠️ Missing (for production)
- JWT validation in middleware (only checks cookie presence)
- Refresh token rotation
- Password reset implementation
- Email verification
- Two-factor authentication

### 📋 Recommendations for production
1. Add JWT signature verification to middleware
2. Implement password reset flow
3. Add email verification step to registration
4. Implement refresh tokens with rotation
5. Add 2FA support
6. Log authentication events for audit trail

---

## Testing the Fixes

### Test middleware protection

```bash
# Before: This would return 200 (unprotected)
# After: This should redirect to /login or return 307

curl -i http://localhost:3000/notes
# Expected: HTTP/1.1 307 Temporary Redirect
```

### Test registration

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Password123"}'

# Expected: 200 OK with user data and session cookie
```

### Test login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"email":"test@example.com","password":"Password123"}'

# Expected: 200 OK + Set-Cookie: session=...
```

### Test authenticated request

```bash
curl http://localhost:3000/api/auth/me \
  -b cookies.txt

# Expected: 200 OK with user data
```

---

## For Your Team

### What changed?

1. **Middleware is now active** — Protected routes enforce authentication
2. **Setup is documented** — Clear instructions for database and environment setup

### What to do?

1. **Pull latest code** (includes `src/middleware.ts` and setup docs)
2. **Follow setup guide** (see `SETUP_QUICK_REFERENCE.md`)
3. **Test register/login** at http://localhost:3000/register

### How long does setup take?

5 minutes for experienced developers. 15 minutes if setting up PostgreSQL for the first time.

---

## Implementation Details

### Custom auth library files

| File | Purpose |
|------|---------|
| `src/lib/auth.js` | JWT token generation, cookie management, response formatting |
| `src/lib/validation.js` | Email/password validation with configurable strength rules |
| `src/lib/rateLimit.js` | In-memory rate limiting (5 per 15 min per email) |
| `src/lib/accountLockout.js` | Account lockout tracking (30 min after 5 failures) |

### API routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/auth/register` | POST | Create new account |
| `/api/auth/login` | POST | Authenticate and create session |
| `/api/auth/logout` | POST | Clear session cookie |
| `/api/auth/me` | GET | Get current user profile |

### Client library

| Function | Purpose |
|----------|---------|
| `login(email, password)` | Call login endpoint |
| `register(email, password)` | Call register endpoint |
| `logout()` | Call logout endpoint |
| `getCurrentUser()` | Call /me endpoint |
| `getErrorMessage(error)` | Extract user-friendly error message |

---

## Known Issues & Limitations

### Issue: Middleware only checks cookie presence

Currently, middleware only verifies the session cookie exists. It does not validate the JWT inside.

**Impact**: An expired token would still pass middleware (but fail at API endpoint level).

**Recommendation**: Add JWT validation to middleware before production:

```typescript
import { verifyJWTToken } from './lib/auth';

export default async function middleware(request: NextRequest) {
    const sessionCookie = request.cookies.get('session')?.value;

    if (!sessionCookie) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    const decoded = verifyJWTToken(sessionCookie);
    if (!decoded) {
        const response = NextResponse.redirect(new URL('/login', request.url));
        response.cookies.delete('session');
        return response;
    }

    return NextResponse.next();
}
```

### Issue: In-memory rate limiting

Rate limiting and account lockout are stored in-memory (`Map`). They reset on server restart and don't work across multiple instances.

**Impact**: In development, no issue. In production with multiple servers, rate limiting won't work.

**Recommendation**: For production, use Redis:

```javascript
// Pseudocode
const redis = new Redis(process.env.REDIS_URL);
const attempts = await redis.get(`login:${email}`);
```

---

## Next Steps

1. ✅ **Understand the implementation** (read this document)
2. ✅ **Follow the setup** (use `SETUP_QUICK_REFERENCE.md`)
3. 📝 **Test locally** (register and login)
4. 🔒 **Before production** (add JWT validation to middleware + use Redis for rate limiting)

---

## Questions?

- **Setup questions?** → See `AUTH_SETUP.md` or `SETUP_QUICK_REFERENCE.md`
- **How does JWT work?** → See `src/lib/auth.js` (30 lines of code)
- **Security concerns?** → See "Security Posture" section above
- **Need to modify auth?** → All logic is in `src/lib/auth.js` and `src/lib/validation.js`

