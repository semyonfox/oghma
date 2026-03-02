# OghaManotes — Local Dev Setup (Quick Reference)

## TL;DR: Get it running in 5 minutes

```bash
# 1. Start PostgreSQL (Docker)
docker run -d --name oghmanotes-db \
  -e POSTGRES_USER=notes_user \
  -e POSTGRES_PASSWORD=notes_password \
  -e POSTGRES_DB=oghmanotes \
  -p 5432:5432 \
  postgres:16-alpine

# 2. Create tables
psql postgresql://notes_user:notes_password@localhost:5432/oghmanotes < database/schema.sql

# 3. Configure environment
cat > .env.local << 'EOF'
DATABASE_URL=postgresql://notes_user:notes_password@localhost:5432/oghmanotes
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
NODE_ENV=development
NEXT_PUBLIC_API_URL=http://localhost:3000
EOF

# 4. Run dev server
pnpm dev

# 5. Test
# Open http://localhost:3000/register
# Create account: test@example.com / Password123
# You should be able to login and access /notes
```

## What you need

| Item | Requirement |
|------|-------------|
| **Database** | PostgreSQL 12+ (local, Docker, or cloud) |
| **Node** | 18+ |
| **Auth** | Custom implementation (not Auth.js or NextAuth) |
| **Session storage** | HTTP-only cookies |

## What was broken (FIXED)

### Bug: Middleware not active

**Problem**: `src/proxy.ts` was named wrong and not loaded by Next.js

**Fix**: Created `src/middleware.ts` with correct export pattern

**Impact**: Protected routes (`/notes`, `/api/notes`, `/settings`, etc.) now properly redirect to `/login` if you're not authenticated

### Bug: Database required but not documented

**Problem**: Register and login endpoints need `public.login` table but it wasn't obvious how to create it

**Fix**: Provided `database/schema.sql` and setup instructions in `AUTH_SETUP.md`

**Impact**: Everyone on the team now knows to run the schema and set `DATABASE_URL`

## Critical environment variables

```env
# REQUIRED for authentication
DATABASE_URL=postgresql://user:password@host:5432/database
JWT_SECRET=<32-character-hex-string>

# REQUIRED for Next.js
NODE_ENV=development
NEXT_PUBLIC_API_URL=http://localhost:3000
```

**How to generate JWT_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Key files changed

1. **CREATED**: `src/middleware.ts` (was `src/proxy.ts`)
   - Renamed file to match Next.js convention
   - Changed function export to `default` (required by Next.js)
   - Added clear documentation
   
2. **CREATED**: `AUTH_SETUP.md` (comprehensive setup guide)

## What happens on register/login

```
User fills form → POST /api/auth/register or /api/auth/login
  ↓
API validates email/password
  ↓
Query public.login table
  ↓
Hash password (bcrypt cost 10)
  ↓
Generate JWT token
  ↓
Set HTTP-only cookie named 'session'
  ↓
User can now access protected routes
```

## Middleware protection (now active)

These routes require a valid session cookie:

```
/notes              - Notes page
/upload             - File upload page
/settings           - Settings page
/trash              - Trash/deleted items
/api/notes/*        - Notes API endpoints
/api/extract/*      - PDF extraction API
/api/tree/*         - Note tree API
/api/trash/*        - Trash API
/api/upload/*       - Upload API
/api/import-export/*- Import/export API
/api/settings/*     - Settings API
```

Without a session cookie, these routes redirect to `/login`.

## Testing authentication

**Register a new user:**
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Password123"}'
```

**Login:**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"email":"test@example.com","password":"Password123"}'
```

**Access protected route:**
```bash
curl http://localhost:3000/api/notes \
  -b cookies.txt
```

**Check current user:**
```bash
curl http://localhost:3000/api/auth/me \
  -b cookies.txt
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `connection ECONNREFUSED 127.0.0.1:5432` | PostgreSQL not running. Run: `docker ps` or check local postgres |
| `database "oghmanotes" does not exist` | Run: `psql postgresql://notes_user:notes_password@localhost:5432/oghmanotes < database/schema.sql` |
| Can register but can't access `/notes` | You already have the fix! The middleware is now active. Make sure dev server is restarted. |
| `JWT_SECRET is not configured` | Add `JWT_SECRET=...` to `.env.local` |
| Can't login with correct credentials | Check database: `SELECT * FROM public.login WHERE email='test@example.com';` |

## Next steps for the team

1. **Everyone pull the latest code** (includes new `src/middleware.ts` and `AUTH_SETUP.md`)
2. **Follow the 5-minute setup** (TL;DR section above)
3. **Test login/register** at http://localhost:3000/register
4. **Read `AUTH_SETUP.md`** for full details

## Need more info?

See `AUTH_SETUP.md` for:
- Detailed setup instructions
- Security notes
- Architecture overview
- All files involved
