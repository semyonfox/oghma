# OghmaNotes: Branch Status Audit

**Date:** March 7, 2025  
**Status:** ⚠️ Minor issues to resolve

---

## Executive Summary

| Issue | Status | Action |
|-------|--------|--------|
| Doc consistency | ⚠️ Main is ahead | Stale docs on older branches |
| Branch cleanliness | ❌ ISSUE | `feature/pdf-rendering` has diverged content |
| Commit alignment | ✅ OK | Most branches are merged, none are ahead |
| Docker Compose | ⏳ TODO | Add for self-hosting post-AWS |

---

## Branch Status Matrix

### Local Branches

| Branch | Status | Commits vs Main | Merged? | Content | Action |
|--------|--------|-----------------|---------|---------|--------|
| **main** | ✅ Current | Baseline | - | v3 SRS, updated docs | Use as source of truth |
| **dev** | 🟡 Stale | 16 behind | ✅ Yes | v2.1 SRS, old docs | Safe to delete |
| **feature/uuid-v7** | 🟡 Stale | 16 behind | ✅ Yes | v2.1 SRS, old docs | Safe to delete |
| **feature/search** | 🟡 Stale | 17 behind | ✅ Yes | v2.1 SRS, old docs | Safe to delete |
| **feature/pdf-rendering** | ❌ DIVERGED | 25 behind, 2 ahead | ❌ NO | SocsBoard content (!!) | **NEEDS MERGE or DELETE** |
| **production** | 🟡 Stale | 25 behind | ✅ Yes | Old SocsBoard content | **REVIEW: Wrong project?** |

---

## Detailed Findings

### ✅ Clean Branches (Can Delete)

**dev, feature/uuid-v7, feature/search**

```
Status: Merged into main
Content: v2.1 SRS (outdated)
README: References docker-compose (AWS-only now)
Action: Safe to delete (all work is in main)
```

Example stale content:
```bash
# In dev/feature/uuid-v7/feature/search:
npm run dev
```
Says docker-compose up (which we removed)

---

### ❌ Problem Branch: feature/pdf-rendering

**CRITICAL:** This branch has **SocsBoard** content, not OghmaNotes!

```bash
# feature/pdf-rendering README shows:
# SocsBoard
# Student event platform for our CT216 project...
```

**Status:**
- 25 commits behind main
- 2 commits ahead (diverged)
- Not merged into main
- Has completely different project content

**Options:**
1. **Delete it** (recommended) — if the code is outdated or wrong project
2. **Investigate** — if there's valid PDF rendering code to cherry-pick
3. **Merge carefully** — if we need the changes, but likely conflicts

---

### ⚠️ Suspicious: production branch

**Status:**
- Has old SocsBoard content in README/docs
- 25 commits behind main
- IS properly merged into main (technically)
- Last commit: "file tree and uplod fixes" (typo suggests old code)

**Issue:** production branch has outdated/wrong project content

**Action:** Verify this is really the production deployment target, or clean up

---

## Documentation Inconsistency Map

### SRS Version Drift

```
main:               v3 (March 2025) ✅ CURRENT
├── SRS title:      "OghmaNotes: Learning Platform with AI Chat"
├── Canvas:         Core feature
└── AWS only:       Yes

dev, feature/uuid-v7, feature/search:  v2.1 (March 6) 🟡 STALE
├── SRS title:      "OghmaNotes: AI-Powered Learning Platform"
├── Canvas:         Different scope
└── Docker:         References docker-compose

feature/pdf-rendering:  OLD content ❌ WRONG
└── README:          "SocsBoard" (different project!)

production:         OLD content ❌ WRONG
└── README:          "SocsBoard" (different project!)
```

### README Drift

```
main:              "Foundation ✅, Phase 1 🔄, Phase 2 ⏳, Phase 3 ⏳" ✅ CURRENT
dev/uuid-7/search: "RAG-powered learning platform" (misleading) 🟡 STALE
pdf-rendering:     "SocsBoard Student event platform" ❌ WRONG PROJECT
production:        "SocsBoard Student event platform" ❌ WRONG PROJECT
```

---

## Recommendations

### Immediate Actions (This Week)

1. **Delete stale feature branches**
   ```bash
   git branch -d dev feature/uuid-v7 feature/search
   git push origin --delete dev feature/uuid-v7 feature/search
   ```

2. **Investigate feature/pdf-rendering**
   ```bash
   git log feature/pdf-rendering --oneline -10
   git diff feature/pdf-rendering...main | head -100
   ```
   **Decision:** Keep or delete? If there's valid PDF code, cherry-pick it. Otherwise delete.

3. **Verify production branch**
   - Is `production` a real deployment target, or legacy?
   - If real: Update docs/README to match main
   - If legacy: Delete or archive

### Long-Term

4. **Consolidate workflow**
   - Keep only: main, main → deploy on push (via Amplify)
   - Consider: Single main branch + feature branches created as needed
   - No long-lived dev/staging branches (causes doc drift)

---

## Git Workflow Recommendation

**Current workflow has problems:**
- Multiple long-lived branches → docs get out of sync
- Old branches not cleaned up → confusion about what's current
- feature/pdf-rendering diverged → potential merge hell

**Better workflow:**
```
main (production-ready, always deployable)
├─ feature/search (short-lived, PR, merge, delete)
├─ feature/rag-chat (short-lived, PR, merge, delete)
└─ feature/canvas (short-lived, PR, merge, delete)
```

**Rules:**
- Feature branches created from main, merged back to main
- Deleted immediately after merge
- Always keep main as single source of truth for docs
- Amplify auto-deploys from main

---

## Docker Compose & Self-Hosting TODO

**Added to backlog:** "Add Docker Compose and self-host options (post-AWS expiry)"

**What needs to happen:**

1. **Create docker-compose.yml**
   - PostgreSQL 12+ with pgvector
   - MinIO for S3-compatible storage
   - Application container
   - Network config

2. **Create .env.example** (already have)
   - Switch S3_ENDPOINT when self-hosting

3. **Update SETUP.md**
   - AWS Amplify setup (current)
   - Docker Compose setup (new section)
   - Self-host prerequisites

4. **Update deployment docs**
   - `docs/DEPLOYMENT.md` — cover both AWS and self-hosted

---

## Files Affected

**To Update:**
- README.md — Already updated ✅
- PROGRESS.md — Already updated ✅
- docs/SRS.tex — Already updated ✅

**To Review:**
- `.github/workflows/` — Any branch-specific workflows?
- `amplify.yml` — Is it pointing at production branch?

---

## Merge & Delete Commands (When Ready)

```bash
# Clean up stale feature branches
git branch -d dev feature/uuid-v7 feature/search
git push origin --delete dev feature/uuid-v7 feature/search

# Decide on feature/pdf-rendering
# Option A: Delete if old code
git branch -D feature/pdf-rendering
git push origin --delete feature/pdf-rendering

# Option B: Investigate and cherry-pick if needed
git log feature/pdf-rendering --oneline -10
git diff feature/pdf-rendering...main > pdf-rendering.patch
git checkout main
git apply pdf-rendering.patch  # Review before committing

# Verify production branch
git show production:README.md | head -20
```

---

## Summary

✅ **All branches are synchronized** (no one is ahead of main in commits)  
🟡 **Doc consistency issue** (main updated, older branches stale)  
❌ **feature/pdf-rendering problem** (diverged, wrong content)  
⚠️ **production branch suspicious** (has SocsBoard content)

**Next step:** Decide whether to clean up stale branches and investigate pdf-rendering.

