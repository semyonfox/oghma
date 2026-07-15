# Milkdown Crepe Spike Report

> **Status:** First implementation spike; not approved for production default
>
> **Date:** 2026-07-15

## Implemented

- client-only Crepe editor used unconditionally on the development branch for review;
- CommonMark/GFM, tables, links, embedded CodeMirror code blocks, LaTeX, and basic images through Crepe 7.21.3;
- the existing `onChange(value, programmaticUpdate?)` and `onSave` boundaries, including external value replacement and `Mod-s`;
- T3-style language selection, raw-code copy feedback, and an accessible per-block wrap toggle;
- expanded public contract fixtures for nested structures, code languages, `diff`, complex math, hard breaks, and safe/opaque/malformed HTML.

The CodeMirror implementation remains in the repository as a manual recovery path, but is no longer selected at runtime. No storage, API, draft, export, or renderer contract changed.

## Findings and remaining gates

- **Fidelity:** The existing read renderer passes the expanded fixture. Milkdown's CommonMark HTML node stores raw HTML as source text and serializes its `value`, but the required sanitized preview/source-backed block is not part of this spike. Fence metadata such as `title=` also needs a preservation extension before rollout.
- **Images:** Existing Markdown image paths load as basic images. Upload integration with the note-assets API remains phase 2 work.
- **Bundle:** The production build isolates the Milkdown editor in a 685,793-byte minified chunk (215,216 bytes gzip). The existing CodeMirror write-editor chunk is 67,112 bytes (22,149 bytes gzip). These are build artifacts from 2026-07-15 and should be remeasured after feature pruning; the current Crepe bundle is not acceptable evidence for default rollout.
- **Cursor/mobile/IME:** Desktop cursor behavior is available for manual evaluation behind the flag. Mobile selection, virtual-keyboard behavior, IME composition, Safari/Firefox behavior, screen-reader flow, and long-note performance are unverified and remain release blockers.
- **Code controls:** Wrap state intentionally lasts only for the mounted block. Copy uses Crepe's raw code text, not highlighted DOM. A small explicit language-icon mapping covers recognizable languages and falls back to Crepe's compact label without adding an icon dependency.
- **HTML/security:** Raw HTML is displayed as inert source by Milkdown, not executed. A sanitized preview must reuse the read-mode policy before HTML can meet the release gate.

## Verification

- `npm run typecheck`
- focused Vitest renderer and code-control tests: 22 passing
- ESLint on touched TypeScript files
- `npm run build`

Stop here and request approval before production migration, HTML node work, note-asset upload integration, or replacing CodeMirror.
