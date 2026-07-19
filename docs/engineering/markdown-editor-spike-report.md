# Milkdown Crepe Spike Report

> **Status:** Implemented editor migration; dated evidence, not a current runbook
>
> **Date:** 2026-07-15

## Implemented

- client-only Crepe editor used unconditionally on the development branch for review;
- CommonMark/GFM, tables, links, embedded CodeMirror code blocks, LaTeX, and basic images through Crepe 7.21.3;
- the existing `onChange(value, programmaticUpdate?)` and `onSave` boundaries, including external value replacement and `Mod-s`;
- T3-style language selection, raw-code copy feedback, and an accessible per-block wrap toggle;
- expanded public contract fixtures for nested structures, code languages, `diff`, complex math, hard breaks, and safe/opaque/malformed HTML.

The standalone CodeMirror implementation was removed after Milkdown became the selected editor. Milkdown still uses its own embedded CodeMirror instance for fenced code blocks. No storage, API, draft, export, or renderer contract changed.

## Findings and remaining gates

- **Fidelity:** The existing read renderer passes the expanded fixture. Milkdown's CommonMark HTML node stores raw HTML as source text and serializes its `value`, but the required sanitized preview/source-backed block is not part of this spike. Fence metadata such as `title=` also needs a preservation extension before rollout.
- **Images:** Existing Markdown image paths load as basic images. Upload integration with the note-assets API remains phase 2 work.
- **Bundle:** The production build measured the Milkdown editor at 685,793 bytes minified (215,216 bytes gzip) during the spike. This is dated evidence from 2026-07-15 and should be remeasured after feature pruning.
- **Cursor/mobile/IME:** Desktop cursor behavior is available for manual evaluation behind the flag. Mobile selection, virtual-keyboard behavior, IME composition, Safari/Firefox behavior, screen-reader flow, and long-note performance are unverified and remain release blockers.
- **Code controls:** Wrap state intentionally lasts only for the mounted block. Copy uses Crepe's raw code text, not highlighted DOM. A small explicit language-icon mapping covers recognizable languages and falls back to Crepe's compact label without adding an icon dependency.
- **HTML/security:** Raw HTML is displayed as inert source by Milkdown, not executed. A sanitized preview must reuse the read-mode policy before HTML can meet the release gate.

## Verification

- `npm run typecheck`
- focused Vitest renderer and code-control tests: 22 passing
- ESLint on touched TypeScript files
- `npm run build`

The production migration and standalone CodeMirror removal were subsequently approved. HTML node work and note-asset upload integration remain separate changes.
