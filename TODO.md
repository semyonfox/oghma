# TODO - Codebase Issues & Implementation Tasks

## COMPLETED

- [x] **Tailwind CSS v4 Setup** (Feb 4, 2025)
  - Added `@tailwindcss/postcss`, `postcss`, `autoprefixer` to devDependencies
  - Added `@headlessui/react` and `@heroicons/react` to dependencies
  - Created `postcss.config.js` with Tailwind plugin
  - Updated `globals.css` to use `@import "tailwindcss"` with custom theme
  - Removed Bootstrap from layout.js and dependencies
  - Integrated SignIn template into `/login` page with full functionality
  - Integrated Register template into `/register` page with validation
  - Deleted dead template component files (84KB saved)
  - Updated DEVELOPMENT_GUIDE.md with Tailwind styling guidelines

---

## CRITICAL - Blocking Issues

- [ ] **Create missing `/api/auth/logout` endpoint**
  - File: `/src/app/api/auth/logout/route.js`
  - Impact: Logout functionality completely broken
  - Reference: REMEDIATION_ACTION_ITEMS.md section 1

- [ ] **Create missing `/api/auth/me` endpoint**
  - File: `/src/app/api/auth/me/route.js`
  - Impact: User profile retrieval and auth verification broken
  - Reference: REMEDIATION_ACTION_ITEMS.md section 2

- [ ] **Add missing dependencies to package.json**
  - Add: `@headlessui/react`, `@heroicons/react`
  - Currently used in components but not declared
  - Will cause import errors at runtime

- [ ] **Delete dead code components (84KB)**
  - `/src/components/LandingPage.jsx`
  - `/src/components/ui/CalendarMonthly.jsx`
  - `/src/components/auth/SignIn.jsx`
  - `/src/components/auth/Register.jsx`
  - `/apps/web/src/pages/LandingPage.jsx`
  - `/apps/web/src/components/auth/Register.jsx`
  - `/apps/web/src/components/auth/SignIn.jsx`
  - `/apps/web/src/components/ui/CalendarMonthly.jsx`

## HIGH PRIORITY

- [ ] **Fix version mismatch between root and apps/web**
  - Unify Next.js: root ^16.0.10 vs apps/web 16.1.3
  - Unify React: root ^19.1.0 vs apps/web 19.2.3
  - Can cause runtime incompatibilities

- [ ] **Consolidate next.config.mjs**
  - Currently have conflicting configs in root and apps/web
  - Unclear which is used

- [ ] **Remove duplicate CSS framework**
  - Currently loading both Bootstrap AND Tailwind (230KB+ waste)
  - Keep Bootstrap, remove Tailwind from apps/web
  - Reference: REMEDIATION_ACTION_ITEMS.md section 5

- [ ] **Fix Docker configuration**
  - Dockerfile uses `npm ci` but project uses `pnpm`
  - docker-compose.yml references missing `stack.env` file
  - Update to use pnpm consistently

- [ ] **Remove console statements in production code**
  - `/src/app/api/auth/login/route.js` line 55
  - `/src/app/register/page.js` lines 20, 25
  - `/src/app/login/page.js` lines 32, 41
  - Replace with proper logger or remove
  - Reference: REMEDIATION_ACTION_ITEMS.md section 10

## MEDIUM PRIORITY

- [ ] **Add security features**
  - Rate limiting on auth endpoints (section 3 of REMEDIATION_ACTION_ITEMS.md)
  - CSRF token validation (section 6)
  - Account lockout mechanism (section 8)
  - Security headers middleware (section 7)
  - Reference: REMEDIATION_ACTION_ITEMS.md

- [ ] **Set up testing framework**
  - Install Jest and testing libraries
  - Create jest.config.js
  - Write core validation tests
  - Write integration tests for auth endpoints
  - Current coverage: 0%
  - Reference: REMEDIATION_ACTION_ITEMS.md section 9

- [ ] **Fix AuthContext usage**
  - AuthProvider.js is defined but never imported/used
  - Either integrate it or delete it

- [ ] **Simplify monorepo structure**
  - `/packages/backend-aws/` - empty, remove or implement
  - `/packages/backend-firebase/` - empty, remove or implement
  - `/packages/core/` - empty, remove or implement
  - `/apps/recommender/` - empty, remove or implement
  - Reference: REMEDIATION_ACTION_ITEMS.md section 11

- [ ] **Fix dynamic import in bootstrapClient.js**
  - Line 8 uses `require()` in ES module context
  - Use dynamic import instead

## LOW PRIORITY

- [ ] **Consolidate ESLint configs**
  - Root and apps/web have different configurations
  - Sync or use shared config

- [ ] **Document monorepo setup**
  - Current structure unclear with unused packages

---

## Notes

- See `REMEDIATION_ACTION_ITEMS.md` for detailed implementation steps and code samples
- See `docs/REQUIREMENTS.md` for project specifications
- See `docs/ARCHITECTURE.md` for system design

Last updated: 2025-02-04
