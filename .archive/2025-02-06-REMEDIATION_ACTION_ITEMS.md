# Remediation Action Items

**Priority:** Address these issues before deployment or university submission

---

## CRITICAL - BLOCKING ISSUES

### 1. Implement Missing `/api/auth/logout` Endpoint

**Status:** Called in UI but doesn't exist (route: missing)
**Impact:** Logout button non-functional, sessions persist
**Effort:** 15 minutes

**Action:**
Create `/src/app/api/auth/logout/route.js`:

```javascript
export async function POST(request) {
  try {
    // Clear authentication state on client via response
    const response = new Response(
      JSON.stringify({ success: true, message: 'Logged out' }),
      {
        status: 200,
        headers: {
          'Set-Cookie': 'authToken=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 UTC;',
          'Content-Type': 'application/json',
        },
      }
    );
    return response;
  } catch (error) {
    return Response.json({ error: 'Logout failed' }, { status: 500 });
  }
}
```

**Testing:**
```bash
curl -X POST http://localhost:3000/api/auth/logout
# Should return 200 with success: true
```

---

### 2. Implement Missing `/api/auth/me` Endpoint

**Status:** Called in UI but doesn't exist (route: missing)
**Impact:** User profile loading broken, auth verification impossible
**Effort:** 20 minutes

**Action:**
Create `/src/app/api/auth/me/route.js`:

```javascript
import { verifyToken } from '@/lib/auth';

export async function GET(request) {
  try {
    // Get token from cookies
    const cookieHeader = request.headers.get('cookie') || '';
    const tokenMatch = cookieHeader.match(/authToken=([^;]+)/);

    if (!tokenMatch) {
      return Response.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const token = tokenMatch[1];
    const user = await verifyToken(token);

    return Response.json({
      success: true,
      user: {
        user_id: user.user_id,
        email: user.email,
      },
    });
  } catch (error) {
    return Response.json(
      { error: 'Invalid token' },
      { status: 401 }
    );
  }
}
```

**Testing:**
```bash
# After login, get the cookie
curl -X GET http://localhost:3000/api/auth/me \
  -H "Cookie: authToken=<your-token>"
# Should return user data with 200
```

---

### 3. Add Rate Limiting to Auth Endpoints

**Status:** No protection against brute force
**Impact:** Critical security vulnerability
**Effort:** 30 minutes

**Action:**
Install rate-limit package:
```bash
npm install express-rate-limit
```

Create `/src/lib/rateLimit.js`:
```javascript
import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // max 5 requests per windowMs
  message: 'Too many login attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'development',
});

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
```

Update login/register routes:
```javascript
// In /src/app/api/auth/login/route.js - ADD AT TOP
import { authLimiter } from '@/lib/rateLimit';

export async function POST(request) {
  // Check rate limit (would need middleware adapter)
  // For now, use in-memory store or implement via middleware
  // ...existing code...
}
```

**Alternative (simpler for Next.js):**
```javascript
// Store failed attempts in memory (per deployment)
const loginAttempts = new Map();

function isRateLimited(email) {
  const key = `login:${email}`;
  const attempts = loginAttempts.get(key) || { count: 0, resetTime: Date.now() + 900000 };

  if (Date.now() > attempts.resetTime) {
    loginAttempts.set(key, { count: 0, resetTime: Date.now() + 900000 });
    return false;
  }

  if (attempts.count >= 5) {
    return true;
  }

  attempts.count++;
  loginAttempts.set(key, attempts);
  return false;
}

export async function POST(request) {
  const { email, password } = await request.json();

  if (isRateLimited(email)) {
    return Response.json(
      { error: 'Too many login attempts. Try again later.' },
      { status: 429 }
    );
  }

  // ...rest of login logic...
}
```

---

### 4. Delete Dead Code (84KB bundle bloat)

**Status:** Unused components included in production
**Impact:** Large bundle size
**Effort:** 10 minutes

**Action - Delete these files:**

```bash
# Delete unused components
rm -f src/components/LandingPage.jsx
rm -f src/components/ui/CalendarMonthly.jsx
rm -f src/components/auth/Register.jsx
rm -f src/components/auth/SignIn.jsx

# Remove empty directories if created
rmdir src/components/auth 2>/dev/null || true
rmdir src/components/ui 2>/dev/null || true
```

**Verify in git:**
```bash
git status
# Should show these files as deleted
```

---

### 5. Remove Duplicate UI Framework (Tailwind + Bootstrap)

**Status:** Both CSS frameworks loaded, creating massive bundle
**Impact:** ~230KB+ unnecessary CSS
**Effort:** 30 minutes

**Action - Keep Bootstrap, Remove Tailwind:**

1. Remove Tailwind from `package.json`:
```bash
npm uninstall tailwindcss postcss autoprefixer
```

2. Remove `tailwind.config.js`:
```bash
rm -f tailwind.config.js postcss.config.js
```

3. Remove Tailwind imports from CSS:
```bash
# Check for tailwind imports
grep -r "@tailwind" src/
grep -r "tailwind" src/
```

4. Update any remaining Tailwind classes to Bootstrap in template files (now deleted):
   - Already done by deleting the template components

5. Verify Bootstrap is properly imported in layout:
```javascript
// src/app/layout.js - Keep this
import 'bootstrap/dist/css/bootstrap.css'
import { BootstrapClient } from '@/components/BootstrapClient'
```

---

## HIGH PRIORITY - SECURITY ISSUES

### 6. Add CSRF Token Validation

**Status:** Not implemented
**Impact:** State-changing requests vulnerable to CSRF
**Effort:** 45 minutes

**Action:**
Install CSRF protection:
```bash
npm install csrf csurf
```

Create `/src/lib/csrf.js`:
```javascript
import { randomBytes } from 'crypto';

const tokens = new Map();

export function generateCsrfToken() {
  const token = randomBytes(32).toString('hex');
  tokens.set(token, true);
  return token;
}

export function validateCsrfToken(token) {
  return tokens.has(token);
}
```

Update login route to require CSRF token:
```javascript
// In POST /api/auth/login
export async function POST(request) {
  const { email, password, csrfToken } = await request.json();

  if (!validateCsrfToken(csrfToken)) {
    return Response.json(
      { error: 'Invalid request' },
      { status: 403 }
    );
  }

  // ...rest of login logic...
}
```

Add to login page:
```javascript
// In src/app/login/page.js
const [csrfToken, setCsrfToken] = useState(null);

useEffect(() => {
  setCsrfToken(generateCsrfToken());
}, []);

const handleLogin = async (e) => {
  e.preventDefault();
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      csrfToken, // Include token
    }),
  });
  // ...
};
```

---

### 7. Add Security Headers Middleware

**Status:** Missing CSP, X-Frame-Options, etc.
**Impact:** XSS, clickjacking vulnerabilities
**Effort:** 20 minutes

**Action:**
Create `/src/middleware.js`:

```javascript
import { NextResponse } from 'next/server';

export function middleware(request) {
  const response = NextResponse.next();

  // Prevent clickjacking
  response.headers.set('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // Enable XSS protection
  response.headers.set('X-XSS-Protection', '1; mode=block');

  // Content Security Policy
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;"
  );

  // Referrer policy
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|favicon.ico).*)'],
};
```

---

### 8. Add Account Lockout After Failed Attempts

**Status:** No protection, unlimited attempts allowed
**Impact:** Brute force attack vector
**Effort:** 25 minutes

**Action:**
Update `/src/lib/auth.js` or create new file:

```javascript
// src/lib/accountLockout.js
const lockedAccounts = new Map();
const LOCK_DURATION = 30 * 60 * 1000; // 30 minutes
const MAX_ATTEMPTS = 5;

export function recordFailedLogin(email) {
  const key = `login:${email}`;
  const attempts = lockedAccounts.get(key) || {
    count: 0,
    lockedUntil: null,
  };

  attempts.count++;
  attempts.lastAttempt = Date.now();

  if (attempts.count >= MAX_ATTEMPTS) {
    attempts.lockedUntil = Date.now() + LOCK_DURATION;
  }

  lockedAccounts.set(key, attempts);
}

export function isAccountLocked(email) {
  const key = `login:${email}`;
  const attempts = lockedAccounts.get(key);

  if (!attempts) return false;

  if (attempts.lockedUntil && Date.now() < attempts.lockedUntil) {
    return true;
  }

  // Reset if lock period expired
  if (attempts.lockedUntil && Date.now() >= attempts.lockedUntil) {
    lockedAccounts.delete(key);
    return false;
  }

  return false;
}

export function clearFailedLogins(email) {
  const key = `login:${email}`;
  lockedAccounts.delete(key);
}
```

Update login route:
```javascript
// In /src/app/api/auth/login/route.js
import { isAccountLocked, recordFailedLogin, clearFailedLogins } from '@/lib/accountLockout';

export async function POST(request) {
  const { email, password } = await request.json();

  if (isAccountLocked(email)) {
    return Response.json(
      { error: 'Account temporarily locked. Try again in 30 minutes.' },
      { status: 429 }
    );
  }

  try {
    const user = await authenticateUser(email, password);
    if (!user) {
      recordFailedLogin(email);
      return Response.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Success - clear failed attempts
    clearFailedLogins(email);

    // ...rest of successful login...
  } catch (error) {
    recordFailedLogin(email);
    return Response.json(
      { error: 'Authentication failed' },
      { status: 500 }
    );
  }
}
```

---

## HIGH PRIORITY - TESTING

### 9. Set Up Jest and Write Core Tests

**Status:** 0% coverage
**Impact:** No validation of critical paths
**Effort:** 2-3 hours

**Action:**

1. Install Jest:
```bash
npm install --save-dev jest @testing-library/react @testing-library/jest-dom jest-environment-jsdom
```

2. Create `jest.config.js`:
```javascript
const nextJest = require('next/jest')

const createJestConfig = nextJest({
  dir: './',
})

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['**/__tests__/**/*.test.js', '**/?(*.)+(spec|test).js'],
}

module.exports = createJestConfig(customJestConfig)
```

3. Create `jest.setup.js`:
```javascript
import '@testing-library/jest-dom'
```

4. Create test files:

**`src/__tests__/unit/validation.test.js`:**
```javascript
import { isValidEmail, isValidPassword } from '@/lib/validation';

describe('Validation', () => {
  describe('isValidEmail', () => {
    test('accepts valid emails', () => {
      expect(isValidEmail('user@example.com')).toBe(true);
    });

    test('rejects invalid emails', () => {
      expect(isValidEmail('not-an-email')).toBe(false);
      expect(isValidEmail('user@')).toBe(false);
    });

    test('rejects SQL injection attempts', () => {
      expect(isValidEmail("' OR '1'='1")).toBe(false);
    });
  });

  describe('isValidPassword', () => {
    test('accepts valid passwords', () => {
      expect(isValidPassword('MyPassword123!')).toBe(true);
    });

    test('rejects short passwords', () => {
      expect(isValidPassword('Short1!')).toBe(false);
    });
  });
});
```

**`src/__tests__/integration/auth.test.js`:**
```javascript
import { describe, test, expect } from '@jest/globals';

describe('Authentication API', () => {
  test('POST /api/auth/login - success', async () => {
    // First register
    await fetch('http://localhost:3000/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'TestPassword123!',
      }),
    });

    // Then login
    const res = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'TestPassword123!',
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.user.email).toBe('test@example.com');
  });

  test('POST /api/auth/login - invalid credentials', async () => {
    const res = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'nonexistent@example.com',
        password: 'WrongPassword123!',
      }),
    });

    expect(res.status).toBe(401);
  });
});
```

5. Run tests:
```bash
npm test
```

---

## MEDIUM PRIORITY - CODE QUALITY

### 10. Remove Console Statements in Production

**Status:** Debug statements left in code
**Impact:** Information leakage
**Effort:** 15 minutes

**Action:**

Find all console statements:
```bash
grep -r "console\." src/ --include="*.js" --include="*.jsx"
```

Remove or replace with proper logger:

Create `/src/lib/logger.js`:
```javascript
const isDev = process.env.NODE_ENV === 'development';

export const logger = {
  log: (...args) => {
    if (isDev) console.log(...args);
  },
  error: (...args) => {
    if (isDev) console.error(...args);
    // In production, send to logging service
  },
  warn: (...args) => {
    if (isDev) console.warn(...args);
  },
};
```

Replace in code:
```javascript
// Before
console.log('User logged in:', user);
console.error('Database error:', error);

// After
import { logger } from '@/lib/logger';
logger.log('User logged in:', user);
logger.error('Database error:', error);
```

---

### 11. Simplify Monorepo Structure

**Status:** Unnecessary complexity for single app
**Impact:** Confusing project layout
**Effort:** 30 minutes

**Action:**

Current structure:
```
socsboard/
├── apps/
│   ├── recommender/
│   └── web/
├── packages/
```

Should be:
```
socsboard/
├── src/
│   ├── app/
│   ├── components/
│   └── lib/
├── database/
├── docs/
```

Steps:
```bash
# Backup current state
git commit -m "backup before structure simplification"

# Move content from apps/web to root
mv apps/web/* .
mv apps/web/.* .

# Remove unneeded structure
rm -rf apps packages pnpm-workspace.yaml
rm -f pnpm-lock.yaml

# Update .gitignore
```

---

### 12. Add Proper Error Logging for Auth Failures

**Status:** No audit trail of failed attempts
**Impact:** Can't investigate security incidents
**Effort:** 20 minutes

**Action:**

Create `/src/lib/auditLog.js`:
```javascript
export const auditLog = {
  loginAttempt: (email, success, reason = null) => {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      type: 'login_attempt',
      email,
      success,
      reason,
      ip: 'N/A', // Add IP extraction if needed
    };

    // In production: send to centralized logging
    console.log(JSON.stringify(logEntry));
  },

  registrationAttempt: (email, success, reason = null) => {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      type: 'registration_attempt',
      email,
      success,
      reason,
    };

    console.log(JSON.stringify(logEntry));
  },
};
```

Use in auth routes:
```javascript
import { auditLog } from '@/lib/auditLog';

export async function POST(request) {
  const { email, password } = await request.json();

  try {
    const user = await authenticateUser(email, password);
    if (user) {
      auditLog.loginAttempt(email, true);
      // ...return success...
    } else {
      auditLog.loginAttempt(email, false, 'invalid_credentials');
      return Response.json(...);
    }
  } catch (error) {
    auditLog.loginAttempt(email, false, 'server_error');
    // ...return error...
  }
}
```

---

## IMPLEMENTATION CHECKLIST

Use this to track progress:

### Week 1: Critical Fixes
- [ ] Implement `/api/auth/logout`
- [ ] Implement `/api/auth/me`
- [ ] Add rate limiting
- [ ] Delete dead code (LandingPage, Calendar, templates)
- [ ] Remove Tailwind, keep Bootstrap
- [ ] Add account lockout mechanism

### Week 2: Security & Testing
- [ ] Add CSRF token validation
- [ ] Add security headers middleware
- [ ] Set up Jest
- [ ] Write validation tests (20+ tests)
- [ ] Write integration tests for auth endpoints
- [ ] Remove console.log statements

### Week 3: Polish
- [ ] Simplify project structure
- [ ] Add audit logging
- [ ] Test against OWASP checklist
- [ ] Update README with security notes
- [ ] Final code review

### Verification
```bash
# Before pushing:
npm run lint
npm test
npm run build

# Test security headers
curl -I https://ct216.semyon.ie
# Should show CSP, X-Frame-Options, etc.

# Check bundle size
npm run build && npm run analyze
# Should show reduced bundle after cleanup
```

---

**Total Estimated Time:** 8-10 hours
**Recommended Parallel Work:** Run linting and tests in parallel while coding
**Git Strategy:** Create feature branches for each section, merge after testing
