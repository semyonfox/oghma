# TODO - Active Blockers & Implementation Tasks

Active blockers and issues to address. See detailed sprint planning in PLANNING.md.

For completed items, see .archive/2025-02-06-REMEDIATION_ACTION_ITEMS.md

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

---

## Implementation Notes

**For detailed implementation steps:** Check .archive/2025-02-06-REMEDIATION_ACTION_ITEMS.md

**For developer onboarding:** See docs/TEAM_GUIDE.md

**For sprint planning:** See PLANNING.md

---

Last updated: Feb 11, 2026
