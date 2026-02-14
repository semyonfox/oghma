# Decision: i18n & Note Sharing

## Executive Summary

**Recommendations**:
1. ✅ **Keep i18n** — Worth it. Notea's setup is clean, maintainable, and positions you well for international expansion without refactoring later.
2. ✅ **Keep sharing infrastructure** — Lightweight abstraction worth preserving. You don't need to implement sharing now, but archiving it costs nothing and unlocks features in Phase 2.

Both decisions are **low-risk, high-optionality** moves. Here's the detailed analysis.

---

## Part 1: i18n (Internationalization) — Keep It

### What Notea Has

**Implementation**: Lightweight rosetta-based system (~250 lines of code)

**Structure**:
```
locales/
├─ index.ts                 (locale definitions)
├─ ar.json                  (Arabic: 100+ strings)
├─ de-DE.json              (German)
├─ fr-FR.json              (French)
├─ it-IT.json              (Italian)
├─ nl-NL.json              (Dutch)
├─ ru-RU.json              (Russian)
├─ sv-SE.json              (Swedish)
└─ zh-CN.json              (Chinese)

libs/web/hooks/
└─ use-i18n.tsx            (hook for components)

libs/web/utils/
└─ i18n-provider.tsx       (context provider)

scripts/
└─ extract-i18n.js         (CLI to auto-extract new strings)
```

**Key features**:
- **Rosetta**: Tiny library (~5KB), zero dependencies, type-safe
- **SSR support**: Works with Next.js Pages Router; easily adapts to App Router
- **String interpolation**: `t('Hello {{name}}', { name: 'Alice' })`
- **Auto-extraction**: Script scans code for `t('...')` calls and generates JSON keys
- **Context API**: Simple, no Redux or complex state

**Usage in Notea**:
```typescript
// In components:
const { t } = useI18n();

// In strings:
<h1>{t('Create a new note')}</h1>
<p>{t('File size must be less than {{n}}mb', { n: 25 })}</p>

// In API responses (optional):
return { message: t('Note created') };
```

### Why Keep It?

**1. Future-proof**
   - University of Galway has international students; expanding to multiple languages is realistic
   - Extracting i18n later means refactoring every component (tedious)
   - Doing it now = 30 min setup, 0 refactoring later

**2. Minimal setup cost**
   - ~300 lines total (hooks, provider, extraction script)
   - One `<I18nProvider>` wrapper in root layout
   - All existing socsboard code works unchanged (i18n is additive)

**3. Notea's system is proven**
   - Battle-tested across 9 languages (ar, de, fr, it, nl, ru, sv, zh-CN)
   - Works seamlessly with Next.js; adapts easily to App Router
   - Auto-extraction script prevents string key mismatches

**4. Effort to implement yourself later**
   - If you skip now: refactor 100+ UI strings, set up React Context, build extraction tooling
   - Cost: ~4 hours vs. 30 min now

### Costs of Keeping i18n

**Minimal**:
- Add dependency: `rosetta` (~5KB)
- 1 file: `locales/index.ts` (list of supported languages)
- 1 file: `libs/web/utils/i18n-provider.tsx` (provider)
- 1 file: `libs/web/hooks/use-i18n.tsx` (hook)
- 1 script: `scripts/extract-i18n.js` (optional; run after adding new strings)
- Maintenance: Every UI string wrapped in `t('...')` (same as without i18n, just explicit)

**No runtime overhead**: Rosetta caches compiled translations; near-zero performance impact.

### Recommendation

✅ **Keep i18n.** Cost is negligible, benefit is high optionality. Copy:
- `locales/` (directory)
- `libs/web/hooks/use-i18n.tsx`
- `libs/web/utils/i18n-provider.tsx`
- `scripts/extract-i18n.js`

Start with English only; when you're ready, add other languages using the extraction script.

---

## Part 2: Note Sharing — Keep the Infrastructure

### What Notea Has

**Sharing model**: Public/private toggle per note

**Architecture**:

```
Notea's Sharing System
├─ Metadata (stored in S3 object meta)
│  └─ `shared` field: PRIVATE (0) or PUBLIC (1)
│
├─ Share Modal UI Component
│  ├─ Toggle: "Share to web" (switch)
│  ├─ Copy link button
│  └─ Share URL: /share/{noteId}
│
├─ Public Page
│  ├─ Route: /share/[id].tsx (public, no auth required)
│  ├─ Display: Read-only note rendering
│  └─ Styling: LayoutPublic component (clean, minimal)
│
├─ Backend Logic
│  ├─ Check `shared` flag before exposing note
│  ├─ Password protection: Optional (Notea supports single-password)
│  └─ No user restrictions: Anyone with link can read
│
└─ UI Integration
   └─ ShareModal component (Material-UI popover)
```

**Code locations**:
- **Meta schema**: `libs/shared/meta.ts` → `NOTE_SHARED { PRIVATE, PUBLIC }`
- **Share modal**: `components/portal/share-modal.tsx` (Material-UI, 100 lines)
- **Public page**: `pages/share/[id].tsx` (Notea's Pages Router)
- **Share logic**: Update note metadata to set `shared` flag

**Current complexity**: Low
   - Toggle flag in metadata
   - Public read endpoint with auth check
   - One public page

### Why Keep the Infrastructure?

**1. Unlock future collaboration**
   - **Phase 2+**: "Share note with classmates" (send private link)
   - **Phase 3+**: "Publish to class board" (instructor-curated shared notes)
   - **Phase 4+**: "Study groups" (shared collaborative notes with specific users)
   
   Without sharing infra, adding these later requires:
   - New data model (sharing permissions, access lists)
   - Auth logic (who can read/write)
   - UI overhaul
   
   With infra preserved: Add permission checks & enhancements incrementally

**2. Minimal refactor needed**
   - Notea's `shared` field (PRIVATE/PUBLIC) → extend with `sharePermissions` array (users who can access)
   - Notea's public page → adapt to App Router, add conditional rendering per permission level
   - ShareModal component → reuse logic, migrate UI to Tailwind

**3. Architecture is sound**
   - Metadata-based: Lightweight, no new DB tables needed (yet)
   - Public page pattern: Standard approach across platforms (Notion, Google Docs, etc.)
   - No tight coupling: Sharing is additive, doesn't break core note app

**4. Low cost to preserve**
   - Copy metadata enum: ~2 lines
   - Archive share modal component: ~100 lines (in `components/notes/sharing/`)
   - Keep public page template: ~50 lines (in `pages/share/` or as route handler in App Router)

### Potential Use Cases (Post-MVP)

1. **Study group sharing**
   - "Share note with Group A (users: alice, bob, carol)"
   - `sharePermissions: { type: 'users', users: [1, 2, 3], permission: 'read' }`

2. **Class-wide shared notes**
   - Instructor publishes note to class
   - "Share with Class CT101"
   - `sharePermissions: { type: 'class', class_id: 42, permission: 'read' }`

3. **Public study resources**
   - Student creates study guide, marks public
   - Other students find via search, can view (no edit)
   - `shared: PUBLIC` (Notea's existing model)

4. **Collaborative editing**
   - "Invite alice@example.com to edit this note"
   - Real-time sync (future; would need Yjs + WebSocket)
   - `sharePermissions: { type: 'users', users: [1], permission: 'edit' }`

### Costs of Keeping Sharing Infrastructure

**Minimal**:
- Add `shared` field to notes table: `SMALLINT` (0 or 1, takes 2 bytes)
- Archive ShareModal component: 100 lines in `components/notes/sharing/share-modal.tsx`
- Template public page: 50 lines in `pages/share/[id].tsx` (App Router)
- No new dependencies; no API overhead

**No runtime overhead**: Sharing checks are metadata lookups; negligible perf impact.

### Sharing: Not an MVP Feature (Explicitly)

**Decision**: Don't implement sharing UI/functionality in Phase 1–3.

**Preserve it because**:
1. Schema is ready (one field in metadata)
2. Code patterns are sketched (modal, public page)
3. Zero cost to archive; high value to have when needed

**Timeline**:
- ✅ **Now (Phase 1–3)**: Copy sharing code, store as templates in `docs/SHARING_IMPLEMENTATION.md`
- ⏳ **Phase 2+ (Weeks 2–4)**: If stakeholders want sharing, activate it:
  - Uncomment ShareModal in `/notes` layout
  - Wire metadata update endpoint
  - Deploy public `/share/[id]` page
  - Enable toggle in settings
  
   Cost at that point: ~2 hours (not days).

### Recommendation

✅ **Keep sharing infrastructure.** Archive for future use:
- Copy `components/portal/share-modal.tsx` → `components/notes/sharing/share-modal.tsx`
- Copy `pages/share/[id].tsx` → archive as template in `docs/SHARING_IMPLEMENTATION.md`
- Add `shared SMALLINT DEFAULT 0` to notes table schema
- Document in `NOTEA_EXTRACTION_PLAN.md` § Sharing (as Phase 2+ feature)

---

## Summary: Why Both Decisions Are Good

| Feature | Why Keep | Effort (Now) | Value (Future) | Risk |
|---------|----------|--------------|----------------|------|
| i18n | Expand internationally without refactoring | 30 min copy | High (language expansion) | None (additive) |
| Sharing | Unlock collaboration features (groups, classes, public) | 1 hour archive | High (social features) | None (template only) |

**Combined effect**: You get a platform ready for:
- 🌍 International expansion (i18n in place)
- 👥 Social learning (sharing infrastructure ready)
- 🎓 Institutional use (multi-language, shareable notes for study groups)

All without added complexity for Phase 1–2 work.

---

## Next Steps

1. **Confirm**: Both decisions (i18n + sharing)?
2. **If yes**: Update `NOTEA_EXTRACTION_PLAN.md` to include:
   - § i18n setup (copy `locales/`, provider, hook, script)
   - § Sharing (copy modal, archive public page, add field to schema)
3. **Implementation**: Add to Phase 1 extraction plan

---

## Appendix: Notea's Sharing Code (For Reference)

### Meta Definition
```typescript
// libs/shared/meta.ts
export enum NOTE_SHARED {
    PRIVATE,
    PUBLIC,
}
```

### Share Modal
```typescript
// components/portal/share-modal.tsx (simplified)
const ShareModal: FC = () => {
    const { t } = useI18n();
    const { note, updateNote } = NoteState.useContainer();

    const handleShare = (_event, checked: boolean) => {
        updateNote({
            shared: checked ? NOTE_SHARED.PUBLIC : NOTE_SHARED.PRIVATE,
        });
    };

    return (
        <Popover>
            <Switch
                checked={note?.shared === NOTE_SHARED.PUBLIC}
                onChange={handleShare}
                label={t('Share to web')}
            />
            <input value={`${location.origin}/share/${noteId}`} readOnly />
        </Popover>
    );
};
```

### Public Page
```typescript
// pages/share/[id].tsx (public route)
export default function SharePage({ note, tree }) {
    return (
        <LayoutPublic>
            <PostContainer note={note} />
        </LayoutPublic>
    );
}

export const getServerSideProps = async (ctx) => {
    const note = await getNoteById(ctx.query.id);
    
    if (note.shared !== NOTE_SHARED.PUBLIC) {
        return { notFound: true };
    }

    return { props: { note } };
};
```

---

**Verdict**: Keep both. Future you will thank present you. 🎯
