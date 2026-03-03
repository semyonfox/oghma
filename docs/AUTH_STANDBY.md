# Authentication System - Current vs. Standby

## Current Production Auth Stack ✅

**Lightweight, Amplify-friendly, battle-tested**

| Component | Library | Reason |
|-----------|---------|--------|
| **Password Hashing** | bcryptjs 3.0.3 | Works in Amplify (no binary compilation), acceptable performance |
| **Sessions** | JWT (jsonwebtoken 9.0.3) | Stateless, no database hits for auth checks, simple |
| **Database Access** | postgres.js 3.4.8 | Lightweight SQL client, no ORM overhead |
| **Email** | nodemailer 8.0.1 | AWS SES compatible, simple config, reliable |
| **Route Protection** | Next.js Proxy Middleware | Native, performant, cookie-based sessions |

### How It Works:
```
1. User registers → Password hashed with bcryptjs
2. Login → bcryptjs.compare() + JWT issued
3. JWT stored in HTTP-only cookie (secure)
4. Every request → proxy.ts validates session cookie
5. Password reset → Email sent via nodemailer + AWS SES
6. Token stored in DB → User clicks link → Password updated
```

### Performance Profile:
- Login: ~100ms (bcryptjs + database query)
- Validation: ~1ms (JWT decode, no DB hit)
- Route protection: ~2ms (proxy middleware)
- Email send: ~2s (AWS SES network)

---

## Standby Systems (For Scaling)

### 1. **Prisma ORM** (v6.19.2)
**Status:** Installed, not currently used  
**When to activate:** If you need...
- Schema migrations (auto-tracked)
- Type-safe database queries
- Multi-table relationships
- Prisma Studio (visual DB management)

**How to activate:**
```bash
# Create schema
prisma init

# Generate models from existing DB
prisma db pull

# Update and sync
prisma migrate dev --name initial
```

**Costs:** +500KB bundle, +100ms startup time  
**Benefit:** Developer productivity, fewer SQL bugs

---

### 2. **better-auth v1.5.2** (Installed, not used)
**Status:** Installed, can be activated  
**When to activate:** If you need...
- Multi-provider OAuth (Google, GitHub, Discord, Apple)
- Session management at scale
- Rate limiting built-in
- Two-factor authentication (2FA)
- User roles & permissions
- Email verification flows

**Current Implementation Time:** ~1 week to fully integrate  
**Cost:** +800KB bundle, significant refactor

**How to activate:**
```bash
# Initialize better-auth
npx better-auth@latest

# Migrate existing users (keep bcryptjs for password hashing)
# Map current DB structure to better-auth schema
```

**Hybrid Approach (Recommended):**
```typescript
// Keep bcryptjs + JWT for:
// - Simple password login (current)
// - Password reset (current)

// Add better-auth for:
// - OAuth providers (Google, GitHub)
// - 2FA / MFA
// - Session management
// - Device tracking
```

---

### 3. **auth.js (NextAuth v5)** (Planned, not installed)
**Status:** Planned for future evaluation  
**When to activate:** If you need...
- Full Next.js auth abstraction layer
- Multiple providers with one library
- Database adapters for any DB
- Built-in refresh token logic
- Callback hooks for custom logic

**Installation:**
```bash
npm install next-auth@beta
```

**Cost:** ~400KB bundle, simpler than better-auth  
**Benefit:** More flexible, easier for custom flows

**Decision Matrix:**
| Need | Current | better-auth | auth.js |
|------|---------|-------------|---------|
| Simple login/register | ✅ | ✅ | ✅ |
| Password reset | ✅ | ❌ (must add) | ❌ (must add) |
| OAuth providers | ❌ | ✅ | ✅ |
| 2FA/MFA | ❌ | ✅ | ❌ (via callbacks) |
| Scaling to 100K users | ❌ | ✅ | ✅ |
| Database flexibility | ❌ | Limited | ✅ |

---

## Migration Path (When Scaling)

### Phase 1 (Current - Production)
- bcryptjs + JWT + postgres.js
- Simple, fast, Amplify-friendly
- Supports: ~10K concurrent users

### Phase 2 (When hitting 10K users)
- Integrate better-auth for OAuth
- Keep bcryptjs for legacy passwords
- Add redis for session caching
- Supports: ~100K concurrent users

### Phase 3 (If expanding globally)
- Switch to auth.js for flexibility
- Implement regional databases
- Add device tracking / geo-blocking
- Supports: 1M+ concurrent users

---

## Current Files

**Production Auth Code:**
```
src/app/api/auth/login/route.js       # bcryptjs + JWT
src/app/api/auth/register/route.js    # Registration
src/app/api/auth/password-reset/      # Email-based reset
src/lib/email.js                       # nodemailer config
src/proxy.ts                           # Session validation middleware
```

**Standby Config Files (Ready to Use):**
```
package.json                           # prisma, better-auth pre-installed
# (auth.js can be added anytime)
```

---

## Recommendations

### For MVP (Current Setup)
✅ **Keep as-is**
- Fast to deploy
- Low complexity
- AWS Amplify optimized
- User feedback ready

### For 10K+ Users
⚠️ **Add OAuth**
```typescript
// Keep current auth
// Add better-auth for: Google, GitHub login
// Users who prefer OAuth sign-up instantly
// Traditional login still works
```

### For Global Scale
🚀 **Consider auth.js**
- More flexible callback system
- Better database adapter support
- Easier custom UX flows
- Stronger community support

---

## Testing Current Auth

```bash
# 1. Test registration
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"SecurePass123!"}'

# 2. Test login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"SecurePass123!"}'

# 3. Test password reset
curl -X POST http://localhost:3000/api/auth/password-reset/request \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com"}'

# 4. Test protected route
curl http://localhost:3000/notes \
  -H "Cookie: session=<your-jwt-cookie>"
```

---

## Timeline for Activation

| System | Status | Effort | Timeline |
|--------|--------|--------|----------|
| **Current (bcryptjs + JWT)** | ✅ Production-ready | Done | Live now |
| **Prisma** | 🟡 Ready to activate | 3 days | When scaling DB |
| **better-auth** | 🟡 Ready to activate | 1 week | When needing OAuth |
| **auth.js** | 🔴 Not installed | 2 weeks | If better-auth insufficient |

---

## Decision Log

**2026-03-03** - Current setup chosen for:
- Simplicity (bcryptjs + JWT)
- Amplify compatibility (no binary deps)
- Performance (no ORM overhead)
- Time to market (3 days build vs 2 weeks with full framework)

**Future Review Points:**
- User count > 10K → Add OAuth (better-auth)
- Global expansion → Evaluate auth.js
- Complex permissions → Activate Prisma + better-auth

