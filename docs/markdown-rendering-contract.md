# OghmaNotes Markdown Rendering Contract

This document defines the Markdown target supported by the one-place notes editor/viewer preview (`src/components/editor/preview-renderer.tsx`). It is a compatibility contract for the current editor and for follow-up renderer work.

## Scope

- **Primary target:** note Markdown rendered in the editor preview/viewer through `PreviewRenderer` and the shared `MarkdownRenderer` wrapper.
- **Storage format:** notes remain plain Markdown text. Renderer affordances must not require a proprietary document format.
- **Out of scope for this contract:** chat/quiz Markdown variants, WYSIWYG editing behavior, PDF rendering, import OCR quality, and future custom blocks such as Mermaid.

## Required syntax support

| Area | Contract |
| --- | --- |
| Headings | CommonMark ATX headings (`#` through `######`) render as heading elements. The editor preview currently applies custom classes to `h1`-`h3`; lower levels fall back to shared/default rendering. |
| Emphasis | `**bold**`, `*italic*`, and GFM `~~strike~~` render as semantic `strong`, `em`, and `del`. |
| Links | Normal `http`/`https` links render as anchors opened in a new tab with `rel="noopener noreferrer"`. Unsafe protocols such as `javascript:` must not render as clickable links. |
| Inline code | Backtick inline code renders as inline `code` with the shared inline-code styling. |
| Fenced code | Triple-backtick fences render as block code through `CodeBlock`. Known languages are syntax-highlighted by `rehype-highlight`; unknown languages render as plain code instead of failing. |
| Code metadata | A fence info string may include optional title metadata: <code>```ts title="example.ts"</code>. The title is displayed in the code-block header alongside the language. Unrecognized metadata is ignored. |
| Lists | Bullet and ordered lists render with explicit list styling because Tailwind resets browser list defaults. |
| Task lists | GFM task list items (`- [x]`, `- [ ]`) render as checkbox inputs and keep GFM task-list classes for styling. |
| Blockquotes | `>` blockquotes render as `blockquote` with editor preview quote styling. |
| Tables | GFM pipe tables render as tables wrapped in an overflow container, with styled header/data cells. |
| Math | `remark-math` and `rehype-katex` render inline math (`$x$`) and display math (`$$x$$`) with KaTeX markup. |
| Images | Markdown images render as lazy `img` elements. Absolute URLs, root-relative URLs, and data URLs are passed through React/rehype sanitization. Marker-style imported note assets named like `_page_1_Figure_2.png` are rewritten to `/api/notes/{noteId}/assets?name=...` when `noteId` is available. |
| Raw HTML | Raw HTML is parsed for the editor preview, then sanitized. A small safe subset needed by notes (`mark`, `details`, `summary`, `kbd`, `sup`, `sub`) is allowed; scripts, event handlers, and unsafe link protocols are stripped. |

## Security boundary

The editor preview intentionally supports a limited raw-HTML subset, but raw HTML is **not** trusted. The render pipeline must keep `rehype-raw` before `rehype-sanitize` and must use `markdownSanitizeSchema` for any preview path that enables raw HTML. Tests assert that `<script>`, event-handler attributes such as `onerror`, and `javascript:` links are removed.

Code fence content is displayed as text inside code blocks. HTML-looking text inside fences must not execute as HTML.

## Fixture and tests

The contract fixture lives at:

- `src/__tests__/fixtures/markdown-contract.md`

Focused renderer tests live at:

- `src/__tests__/lib/preview-renderer.test.ts`

The fixture intentionally covers headings, emphasis, strike, safe/unsafe links, inline code, known and unknown fenced code, title metadata, lists, task lists, blockquotes, tables, inline/display math, note-asset image rewriting, safe HTML, and XSS boundaries.

## Follow-up notes for downstream renderer lanes

- If downstream PRs replace the renderer or add a rich-text editing model, keep this contract fixture green or update this document in the same PR with the intentional compatibility change.
- Mermaid, wikilinks/backlinks, callouts, footnotes, frontmatter rendering, and arbitrary local image path resolution are not part of this lane's supported contract.
- The chat and quiz Markdown renderers share lower-level pieces but have different plugin/sanitization choices; do not treat this document as their full contract without a separate review.
