# Markdown Editing and Rendering

> **Status:** Active compatibility contract
>
> **Last reviewed:** 2026-07-21
>
> **Source of truth:** Editor/renderer code and [`src/__tests__/fixtures/markdown-contract.md`](../../src/__tests__/fixtures/markdown-contract.md)

OghmaNotes stores notes as portable Markdown and presents them through one writing surface. This contract protects that storage format, the current editor decision, and the safe rendering boundary.

## Editor decision

- canonical note content is plain Markdown;
- Milkdown Crepe is the production editor surface in [`milkdown-write-editor.tsx`](../../src/components/editor/milkdown-write-editor.tsx);
- Milkdown's embedded CodeMirror owns fenced-code editing; the retired standalone CodeMirror editor is not a fallback path;
- Markdown syntax may be visually quiet when inactive, but remains directly editable and portable;
- MDX/JSX is not the note format;
- editor changes must preserve Markdown round-trip fidelity, selection/keyboard behaviour, mobile usability, performance, and security.

## Shared renderer

[`MarkdownRenderer`](../../src/lib/markdown/renderer.tsx) centralizes the note, chat, and quiz pipelines.

| Variant | Hard breaks | Raw HTML | Sanitized |
|---|---:|---:|---:|
| `note` | Yes | Parsed, then sanitized | Yes |
| `chat` | Yes | No | Yes |
| `quiz` | No | No | Yes |

All variants share GFM, math parsing, KaTeX, safe links, inline-code styling, and the same code-block component. They also inherit one document typography layer from `.md-rendered`; the `chat` variant changes density, not component design. Variant differences must stay explicit rather than growing separate plugin stacks or per-surface element overrides.

## Note rendering contract

The note preview supports:

- ATX headings, emphasis, strikethrough, links, blockquotes, ordered and unordered lists;
- GFM task lists and tables;
- inline and fenced code, including optional `title`, `filename`, or `file` fence metadata;
- inline and display math through KaTeX;
- fenced `mermaid` diagrams with lazy, strict, sanitized SVG rendering and source fallback;
- lazy images and Marker-style note-asset rewriting when a note ID is available;
- internal note references stored as portable Markdown links to stable
  `/notes/<uuid>` routes, inserted through the editor toolbar or `[[` picker;
- a small sanitized raw-HTML subset used by notes, including `mark`, `details`, `summary`, `kbd`, `sup`, and `sub`.

Fenced code is rendered by [`CodeBlock`](../../src/lib/markdown/components/code-block.tsx) and highlighted lazily with **Shiki**, not `rehype-highlight`. Known aliases are normalized; unsupported languages fall back to plaintext; missing languages display a `CODE` label. Highlighting must never turn code content into executable HTML.

Rendered notes, chat answers, and quiz content use the same semantic colours, spacing rhythm, code chrome, table treatment, task controls, and display-math surface. Compact contexts may reduce type and spacing through their renderer variant, but must not redefine Markdown elements component-by-component. Write-mode math uses the same surface tokens so switching between editing and rendered content does not introduce a new visual language.

Backlinks are derived from canonical internal note references and displayed in
the note inspector. Obsidian-style wikilink storage, transclusion, callouts,
footnotes, frontmatter rendering, arbitrary local paths, and MDX components are
not part of this contract unless added deliberately with tests.

## Security boundary

Markdown is untrusted input.

- When raw HTML is enabled, `rehype-raw` must run before `rehype-sanitize` with `markdownSanitizeSchema`.
- Scripts, event attributes, and unsafe protocols such as `javascript:` must be removed.
- Code fence content is text even when it looks like HTML.
- Mermaid SVG is generated client-side in strict mode and sanitized before insertion; invalid diagrams retain their fenced source.
- New renderer variants must choose raw-HTML and sanitization behaviour explicitly.
- Do not insert user Markdown or raw code through `dangerouslySetInnerHTML`.

## Verification

The compatibility fixture is [`src/__tests__/fixtures/markdown-contract.md`](../../src/__tests__/fixtures/markdown-contract.md). Focused assertions live in [`src/__tests__/lib/preview-renderer.test.ts`](../../src/__tests__/lib/preview-renderer.test.ts) and cover core syntax, safe/unsafe HTML, links, code metadata, Shiki fallback, math, tables, tasks, and note assets.

Any editor or renderer change must keep this fixture green or update this document and the fixture together to record an intentional compatibility change.
