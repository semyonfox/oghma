# TODO - Codebase Issues & Implementation Tasks

Active blockers and issues to address. See detailed implementation steps in REMEDIATION_ACTION_ITEMS.md.

---

## CRITICAL - Blocking Issues

### Code Quality & Structure

- [ ] **Delete dead code components** (empty directories, unused files)
  - `/src/components/auth/` (empty directory)
  - Task: `rm -rf src/components/{auth,ui}` if empty
  - Impact: 84KB of bundle savings already done, just cleanup

- [ ] **Remove duplicate monorepo structure**
  - Delete: `/apps/web/`, `/apps/recommender/`, `/packages/`
  - Keep: root `src/` and `src/app/`
  - Delete: `pnpm-workspace.yaml`
  - Impact: Cleaner project structure, fewer confusing directories

- [ ] **Remove console.log statements**
  - Locations: `/src/app/api/auth/login/route.js`, register/login pages
  - Reason: Information leakage, not production-ready
  - Details: See REMEDIATION_ACTION_ITEMS.md section 10

- [ ] **Fix Docker configuration mismatch**
  - Dockerfile uses `npm ci`, project uses `pnpm`
  - Fix: Update Dockerfile to use `pnpm install`
  - Update: docker-compose references

### Dependencies

- [ ] **Remove duplicate lock files**
  - Keep: `pnpm-lock.yaml` (project uses pnpm)
  - Delete: `package-lock.json` (188KB unused)

### Unused Code

- [ ] **Remove unused AuthContext**
  - File: `src/context/AuthProvider.js`
  - Status: Defined but never imported
  - Decision: Delete unless needed for future features

---

## HIGH PRIORITY - Would Improve Developer Experience

- [ ] **Clean up unused IDE config**
  - Consider: `.idea/` directory (IntelliJ config)
  - Decision: Remove if not shared by team

- [ ] **Simplify version mismatches**
  - Root uses Next.js ^16.0.10, React ^19.1.0
  - apps/web (unused) has different versions
  - Impact: Once apps/web deleted, this is resolved

---

## MEDIUM PRIORITY - Security & Testing

- [ ] **Set up testing framework**
  - Install: Jest and testing libraries
  - Create: jest.config.js
  - Write: Core validation tests first
  - Write: Integration tests for auth endpoints
  - Current coverage: 0%
  - Details: REMEDIATION_ACTION_ITEMS.md section 9

- [ ] **Add security features** (gradual)
  - Rate limiting on auth endpoints (section 3)
  - CSRF token validation (section 6)
  - Account lockout mechanism (section 8)
  - Security headers middleware (section 7)

---

## LOW PRIORITY - Future Work

- [ ] **ESLint config consolidation**
  - Once apps/web deleted, keep root config only

- [ ] **Improve GLOSSARY.md**
  - Currently minimal (5 entries)
  - Expand as team uses new terms

- [ ] **Archive old documentation**
  - Remove: `docs/ARCHIVE_REFACTORING_2025-01-25.md`
  - Keep: Everything else

---

## COMPLETED ✅

- [x] Tailwind CSS v4 setup and migration from Bootstrap
- [x] Delete template components (LandingPage, Calendar, etc.)
- [x] GitHub Actions + PR template
- [x] Auth endpoints (logout, me) - see REMEDIATION_ACTION_ITEMS.md sections 1-2
- [x] Rate limiting + account lockout (implemented with in-memory store)
- [x] Security headers middleware (basic CSP, X-Frame-Options, etc.)
- [x] Documentation refactoring (TEAM_GUIDE.md, TECH_LEAD_GUIDE.md created)
- [x] Development patterns guide (DEVELOPMENT_PATTERNS.md created)

---

## Implementation Notes

**REMEDIATION_ACTION_ITEMS.md contains:**
- Detailed code examples for missing endpoints
- Step-by-step fixes for each issue
- Testing instructions for completed work
- Implementation checklists

**For detailed steps on any item:** Check REMEDIATION_ACTION_ITEMS.md

**For developer onboarding:** See `docs/TEAM_GUIDE.md`

**For tech lead checklist:** See `docs/TECH_LEAD_GUIDE.md`

---

Last updated: Feb 6, 2026
