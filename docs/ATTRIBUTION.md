# Attribution & Licensing

## Notea Attribution

This project incorporates components and architectural patterns from **Notea**, an open-source markdown note-taking application.

**Original Project:**
- **Name:** Notea
- **Author:** [@qingwei-li](https://github.com/qingwei-li) (Cinwell Li)
- **Repository:** https://github.com/notea-org/notea
- **License:** MIT License (see below)
- **Version:** 0.4.0-alpha
- **Status:** Archived (maintained as reference)

### Components Extracted from Notea

The following components and utilities have been extracted, adapted, and integrated into this project:

#### 1. S3 Storage Provider
**Files:**
- `libs/server/store/providers/s3.ts` → `apps/web/src/lib/storage/s3-provider.ts`
- `libs/server/store/providers/base.ts` → `apps/web/src/lib/storage/store-provider.ts`
- `libs/server/store/utils.ts` → `apps/web/src/lib/storage/utils.ts`

**Purpose:** Abstract S3-compatible storage layer (AWS S3, MinIO, etc.)  
**License:** MIT (inherited from Notea)

#### 2. Rich Markdown Editor
**Directory:**
- `components/editor/` → `apps/web/src/components/editor/`

**Components:**
- `editor.tsx` - Main editor component (ProseMirror-based)
- `main-editor.tsx` - Editor wrapper
- `theme.ts` - Editor theming
- `extensions/` - ProseMirror extensions
- `embeds/` - Link embeds and bookmarks
- `tooltip.tsx`, `edit-title.tsx`, `delete-alert.tsx` - Editor utilities

**Dependencies:** `@notea/rich-markdown-editor`, `prosemirror-inputrules`  
**License:** MIT (inherited from Notea)

#### 3. File Tree / Sidebar UI
**Directory:**
- `components/sidebar/` → `apps/web/src/components/notes/sidebar/`

**Components:**
- `sidebar.tsx` - Main sidebar container
- `sidebar-list.tsx` - Hierarchical note list
- `sidebar-tool.tsx` - Sidebar toolbar
- `sidebar-list-item.tsx` - List item component
- `favorites.tsx` - Favorites section

**Dependencies:** `@atlaskit/tree`  
**License:** MIT (inherited from Notea)

#### 4. State Management & API Hooks
**Directories:**
- `libs/web/api/` → `apps/web/src/lib/notes/api/`
- `libs/web/state/` → `apps/web/src/lib/notes/state/`
- `libs/web/cache/` → `apps/web/src/lib/notes/cache/`
- `libs/web/hooks/` → `apps/web/src/lib/notes/hooks/`

**Key Files:**
- `use-note-api.ts` - Note CRUD hooks
- `note-state.ts` - Note state container
- `tree-state.ts` - File tree state
- `editor-state.ts` - Editor state

**Dependencies:** `unstated-next`, `localforage`  
**License:** MIT (inherited from Notea)

#### 5. Markdown Utilities
**Files:**
- `libs/web/utils/markdown.ts` → `apps/web/src/lib/markdown/utils.ts`
- `libs/shared/markdown/` → `apps/web/src/lib/markdown/shared/`

**Purpose:** Markdown parsing, rendering, and syntax highlighting  
**Dependencies:** `highlight.js`, `markdown-link-extractor`  
**License:** MIT (inherited from Notea)

#### 6. Note Format & Schema
**Files:**
- `libs/shared/note.ts` → `apps/web/src/lib/notes/types.ts`
- `libs/shared/meta.ts` → `apps/web/src/lib/notes/meta.ts`

**Purpose:** Type definitions for notes and metadata  
**Adaptations:** Added `userId` field (for multi-user), `s3Path` field, optional `aiMetadata`  
**License:** MIT (inherited from Notea)

#### 7. Internationalization (i18n)
**Directories:**
- `locales/` → `apps/web/src/locales/` (all 9 language files)
- `libs/web/hooks/use-i18n.tsx` → `apps/web/src/lib/i18n/use-i18n.tsx`
- `libs/web/utils/i18n-provider.tsx` → `apps/web/src/lib/i18n/i18n-provider.tsx`
- `scripts/extract-i18n.js` → `scripts/extract-i18n.js`

**Supported Languages:** Arabic, German, French, Italian, Dutch, Russian, Swedish, Chinese (Simplified)  
**Library:** `rosetta` (i18n framework)  
**License:** MIT (inherited from Notea)

#### 8. Sharing Infrastructure (Archived for Phase 2+)
**Files:**
- `components/portal/share-modal.tsx` → `apps/web/src/components/notes/sharing/share-modal.tsx` (archived)
- `pages/share/[id].tsx` → documented in `docs/SHARING_IMPLEMENTATION.md` (template)

**Purpose:** Public note sharing mechanism (preserved for future implementation)  
**License:** MIT (inherited from Notea)

---

## Modifications & Adaptations

All extracted code has been adapted for this project:

1. **Authentication:** Replaced Notea's single-password model with multi-user JWT authentication
2. **Database:** Adapted for PostgreSQL (instead of S3-only storage) with user ownership
3. **Framework:** Updated components to work with Next.js 16 App Router (from Pages Router)
4. **Styling:** Material-UI components adapted to work alongside Tailwind CSS (full migration planned)
5. **State Management:** Integrated with socsboard's existing context patterns
6. **API Routes:** New endpoints created for note CRUD, tailored to multi-user architecture
7. **Type Safety:** Extended TypeScript types with application-specific fields

---

## MIT License (Notea)

Full text of the MIT License from Notea:

```
MIT License

Copyright (c) 2021 qingwei-li <cinwell.li@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Why We Chose Notea

**Design Quality:** Notea's architecture is clean, modular, and well-structured. Components are loosely coupled and easy to extract.

**Open Source Excellence:** MIT-licensed with a thoughtful codebase that demonstrates good patterns for:
- Cloud storage abstraction (S3 provider)
- State management (unstated-next containers)
- Internationalization (rosetta-based i18n)
- Rich text editing (ProseMirror integration)

**Educational Value:** As a reference for how to build a note-taking application with modern React patterns.

**Deprecated but Valuable:** While Notea is no longer actively maintained, its code remains relevant and dependencies are stable. We're extending it, not maintaining it.

---

## Dependencies Inherited from Notea

| Package | Version | License | Purpose |
|---------|---------|---------|---------|
| `@notea/rich-markdown-editor` | 11.22.0 | MIT | Rich markdown editor |
| `prosemirror-inputrules` | ^1.1.3 | MIT | ProseMirror extensions |
| `@atlaskit/tree` | ^8.6.3 | Apache 2.0 | File tree UI |
| `unstated-next` | ^1.1.0 | MIT | State management |
| `highlight.js` | ^10.7.2 | BSD-3 | Code syntax highlighting |
| `markdown-link-extractor` | ^4.0.1 | MIT | Link extraction |
| `remove-markdown` | ^0.3.0 | MIT | Markdown stripping |
| `rosetta` | ^1.1.0 | MIT | Internationalization |
| `localforage` | ^1.9.0 | Apache 2.0 | Local storage cache |
| `react-split` | ^2.0.9 | MIT | Resizable split panes |
| `react-hotkeys-hook` | ^3.3.1 | MIT | Keyboard shortcuts |

---

## How to Contribute

If you improve or extend components extracted from Notea:

1. Maintain attribution in code comments where relevant
2. Keep the MIT license intact for modified files
3. Document your adaptations in commit messages
4. Consider contributing improvements back to the open-source community

---

## Questions About Attribution?

- **Why include Notea attribution?** Because it's good practice, respects the open-source community, and the MIT license requires it.
- **Can we modify Notea code?** Yes, MIT license allows modifications.
- **Do we need to publish modified code?** No; MIT doesn't require it. But if we do, we must include the license.
- **How do we credit the original author?** Through this file, comments in code, and the README.

---

## References

- **Notea Repository:** https://github.com/notea-org/notea
- **MIT License:** https://opensource.org/licenses/MIT
- **Original Author:** [@qingwei-li](https://github.com/qingwei-li)

---

**This project was built with gratitude for Notea's excellent design and clean code.**

*Last Updated: February 14, 2025*
