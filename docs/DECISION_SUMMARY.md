# Updated Plan: i18n & Sharing Decisions

## Your Decision: Both Kept ✅

You've decided to keep **i18n** and **note sharing infrastructure**. Here's my professional assessment:

---

## My Verdict (Prose)

### i18n: Smart Investment

**You're making the right call.** Notea's i18n is lightweight (~300 lines), proven across 9 languages, and positions you perfectly for international growth. The critical insight: i18n done early costs 30 minutes; i18n retrofitted costs 4 hours of refactoring every UI string. University of Galway is international; this investment will pay off.

**Implementation is dead simple**:
- Copy `locales/` directory (9 language files)
- Copy 2 hooks/utils (~200 lines total)
- Copy extraction script (auto-generates new translation keys)
- Wrap root in `<I18nProvider>`

You don't activate it until you need it (English-only Phase 1–2), but the scaffolding is there. When a Portuguese or Chinese student joins, turning on translations takes 1 hour, not 1 week.

**Cost-benefit**:
- Cost now: 30 min copy + boilerplate
- Cost later (without it): 4 hours refactoring + complexity
- Benefit: Future-proof for institutional use

### Sharing Infrastructure: Keep as Template

**Also smart.** Note sharing isn't MVP, but the infrastructure is trivial: one metadata field (`shared: PRIVATE|PUBLIC`), one modal component (100 lines), one public page template (50 lines). You're not implementing sharing now; you're *preserving the patterns* so it takes 2 hours to activate later instead of 2 days to architect.

**Why this matters**: Your platform's future includes collaboration—study groups sharing notes, instructors publishing class guides, students browsing public study resources. Sharing isn't a tacked-on feature; it's architectural. Notea got this right. Copy the pattern now, use it in Phase 2+.

**What you get**:
- Phase 1–3: Core app (auth, notes, S3, AI)
- Phase 2+: Unlock sharing with minimal new code
  - Study groups: `sharePermissions: { type: 'group', group_id: 123, permission: 'read' }`
  - Class sharing: `sharePermissions: { type: 'class', class_id: 42, permission: 'read' }`
  - Public notes: `shared: PUBLIC` (Notea's existing model)

All scaffolded already.

---

## Implementation: What Changes in the Plan

### New Section in NOTEA_EXTRACTION_PLAN.md

Added **§ 5: What We Archive (Preserved for Later)**:
- i18n: Copy in Phase 1, activate on demand
- Sharing: Archive in Phase 1, activate in Phase 2+

### New Documentation

Created **`DECISION_I18N_AND_SHARING.md`**:
- Detailed breakdown of Notea's i18n system (rosetta-based, 9 languages)
- Notea's sharing model (metadata enum, modal UI, public page)
- Pros/cons analysis for both
- Use cases for sharing (study groups, class-wide notes, public resources)
- Phase-by-phase activation plan

---

## Updated Extraction List

### Phase 1 Now Includes

✅ **i18n Setup**:
- Copy: `locales/` (9 JSON language files)
- Copy: `libs/web/hooks/use-i18n.tsx`
- Copy: `libs/web/utils/i18n-provider.tsx`
- Copy: `scripts/extract-i18n.js` (auto-extraction tool)
- Integrate: Wrap root layout in `<I18nProvider locale="en" lngDict={...} />`
- Archive: `docs/I18N_IMPLEMENTATION.md` (how to add new languages later)

✅ **Sharing Architecture**:
- Copy: `components/portal/share-modal.tsx` → `components/notes/sharing/share-modal.tsx` (archived)
- Copy: `pages/share/[id].tsx` → archive as template (public page pattern)
- Add to DB schema: `shared SMALLINT DEFAULT 0` (in notes table)
- Document: `docs/SHARING_IMPLEMENTATION.md` (how to activate in Phase 2+)

### Database Schema Update

```sql
CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  s3_path VARCHAR(512) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  tags TEXT[] DEFAULT '{}',
  shared SMALLINT DEFAULT 0,        -- NEW: 0 = PRIVATE, 1 = PUBLIC
  
  INDEX idx_user_notes (user_id, created_at DESC),
  INDEX idx_title_search (title),
  INDEX idx_shared (shared)          -- For efficient public note queries
);
```

---

## Phase 1 Dependencies Update

Add to `apps/web/package.json`:

```json
"dependencies": {
  "rosetta": "^1.1.0"  // i18n library (5KB, zero deps)
}
```

All other dependencies unchanged.

---

## Activation Timeline

### Phase 1 (Days 1–2): Setup
- Copy i18n files + provider (integrate, English-only)
- Copy sharing templates + schema field
- Everything dormant; no UI impact

### Phase 2+ (Weeks 2+): Activate as Needed
- **i18n**: When 2nd language requested → run extraction script, translate JSON
- **Sharing**: When stakeholders ask for study groups → activate ShareModal, deploy public page

---

## Quick Ref: What's Being Extracted Now

| What | Where | Status | Phase |
|------|-------|--------|-------|
| i18n provider + hooks | `libs/web/` | Active (English only) | 1 |
| i18n locales | `locales/` | Copied (expand on demand) | 1 |
| i18n extraction script | `scripts/` | Copied (run when needed) | 1 |
| Sharing metadata enum | Database schema | Added (0 = PRIVATE, 1 = PUBLIC) | 1 |
| ShareModal component | `components/notes/sharing/` | Archived (uncomment when ready) | 2+ |
| Public page template | `docs/SHARING_IMPLEMENTATION.md` | Documented (deploy when ready) | 2+ |

---

## Why This Is the Right Decision

1. **No cost to prepare, high value to have**: i18n + sharing infrastructure costs 1 hour to archive, saves 5 hours in Phase 2+

2. **Positions you for growth**: 
   - International expansion (i18n)
   - Social learning features (sharing)
   - Institutional adoption (both)

3. **Risk-free**: Everything dormant in Phase 1; zero impact on MVP

4. **Socsboard's auth stays pure**: You're not overcomplicating; i18n + sharing are truly additive

---

## Next Step

Ready to proceed with Phase 1 implementation? You now have:
- ✅ NOTEA_EXTRACTION_PLAN.md (updated with i18n + sharing)
- ✅ DECISION_I18N_AND_SHARING.md (detailed analysis)
- ✅ QUICK_REFERENCE.md (file-by-file guide)
- ✅ ARCHITECTURE_DIAGRAMS.md (visual reference)
- ✅ AI_KEY_PROXY.md (BYO key model)

All docs are in socsboard's `docs/` folder. Everything is locked, nothing changes.

**Ready to start Phase 1?** (Copy files, install deps, create DB schema)
