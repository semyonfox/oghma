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

- [x] **Remove duplicate monorepo structure** ✅ COMPLETED
  - Deleted: `pnpm-workspace.yaml`, `pnpm-lock.yaml`
  - Note: Keeping `/apps/` structure for now (web + recommender services)
  - Impact: Cleaner project structure

- [x] **Switch to npm for deployment compatibility** ✅ COMPLETED
  - Reason: AWS Amplify has better native npm support
  - Trade-off: Slower installs but easier deployment
  - Updated: Dockerfile already uses npm, amplify.yml now uses npm

- [ ] **Remove console.log statements**
  - Locations: `/src/app/api/auth/login/route.js`, register/login pages
  - Reason: Information leakage, not production-ready
  - Details: See REMEDIATION_ACTION_ITEMS.md section 10

### Dependencies

- [x] **Remove duplicate lock files** ✅ COMPLETED
  - Keep: `package-lock.json` (project uses npm)
  - Deleted: `pnpm-lock.yaml`

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

Last updated: Feb 12, 2026
