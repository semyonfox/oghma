# Unified Markdown Editor Migration Handover

> **Status:** Target implementation and validation handover
>
> **Last reviewed:** 2026-07-15
>
> **Source of truth for:** Requirements, candidate selection, spike scope, release gates, and visual references for replacing the experimental CodeMirror live-preview writing surface
>
> **Does not supersede:** [Markdown editing and rendering](markdown-rendering.md). CodeMirror remains the production editor until this handover's release gates pass and the active contract is deliberately updated.

## Outcome

Build a feature-flagged **Milkdown Crepe** prototype as the primary candidate for the OghmaNotes writing surface. Keep Markdown as the sole canonical note format in the database, APIs, drafts, imports, exports, search, and AI context.

The intended runtime flow is:

```text
Stored Markdown
      ↓ parse
Milkdown / Remark AST
      ↓ transform
ProseMirror document
      ↓ edit in one visual surface
Milkdown serializer
      ↓
Stored Markdown
```

The editor may normalize equivalent Markdown syntax. Semantic preservation is required; byte-for-byte preservation is not. Loading an unchanged note should avoid unnecessary saves.

Do not extend the current CodeMirror live-preview implementation with more replacement widgets. CodeMirror remains useful inside fenced code blocks, where its document contains only code and therefore has a stable source-to-screen mapping.

## Product requirements

### Non-negotiable

- Markdown remains canonical and portable.
- One unified Typora/Notion-like editing surface is the default experience.
- Normal editing does not require a separate preview pane.
- Markdown shortcuts work while typing.
- Cursor placement, selection, undo, paste, scrolling, and mobile interaction are reliable.
- Existing drafts, autosave, conflict detection, cross-pane synchronization, and note asset behavior continue to work.
- The existing read-mode renderer remains the rendering and sanitization contract for notes, chat, and quizzes.

### Required Markdown features

- CommonMark headings, emphasis, strong emphasis, inline code, horizontal rules, links, images, lists, and blockquotes;
- GFM strikethrough, task lists, autolinks, and tables;
- correctly nested ordered/unordered/task lists and blockquotes;
- editable and openable links;
- inline and fenced code;
- fenced language preservation, including `diff`;
- optional fence metadata already accepted by OghmaNotes, such as `title="example.ts"`, even if the first editor UI does not expose titles;
- inline and block LaTeX rendered with KaTeX;
- sanitized raw HTML preservation;
- Marker-style note image paths and the current note-assets API.

### Deliberately not required

Revealing Markdown punctuation around the active cursor is not a release requirement. Markdown remains transparent through shortcuts, import/export, an advanced whole-note source action, and source editing for opaque blocks. Avoid recreating CodeMirror live-preview cursor mapping inside ProseMirror.

Definition lists, footnotes, highlights, abbreviations, callouts, custom task states, and alternative subscript/superscript syntaxes are not all standard Markdown. Add them only as explicit, tested syntax extensions. The public syntax guide must distinguish supported syntax from examples that merely work in some parsers.

## Candidate assessment

| Candidate | Assessment for OghmaNotes |
|---|---|
| **Milkdown Crepe** | Primary candidate. Markdown-first WYSIWYG architecture using Remark and ProseMirror; provides code editing, tables, links, lists, LaTeX, block controls, toolbars, Markdown events, and `getMarkdown()`. |
| **Tiptap** | Fallback. Excellent React/node-view ecosystem and official code, table, link, math, and Markdown packages. Its Markdown package is currently documented as beta and has known representational limits. |
| **Plate** | Third option. Offers two-way CommonMark/GFM conversion and custom Markdown rules, but custom elements tend toward MDX serialization and introduce a format/security decision OghmaNotes does not need. |
| **Toast UI Editor** | Mature Markdown/WYSIWYG modes, but less aligned with the desired extensible Notion-like block experience. |
| **Lexical** | Capable engine with Markdown transformers, but requires assembling much more of the editor, serialization, and UI contract. |
| **BlockNote** | Rejected because its official documentation describes Markdown conversion as lossy and recommends storing its block JSON. |
| **ProseMirror directly** | Rejected for the first implementation because it is deliberately a toolkit rather than a ready editor; Milkdown already supplies the Markdown transformation layer. |
| **MDX** | Not an editor and not an acceptable note format. It introduces JSX/JavaScript semantics and is unsafe for untrusted authors without strong isolation. |
| **CodeMirror live preview** | Retains perfect literal source fidelity but has reached a demonstrated UX ceiling for block widgets, cursor mapping, nested structures, and arbitrary HTML. |

## Why Milkdown Crepe is first

Milkdown is explicitly a WYSIWYG Markdown framework. Its transformer maps Markdown to a Remark AST, then to a ProseMirror document, and serializes back through the inverse path. Crepe supplies an opinionated editor layer above Milkdown.

Verified current package information on 2026-07-15:

- `@milkdown/crepe` version `7.21.3`, MIT;
- `@milkdown/kit` version `7.21.3`, MIT;
- Crepe includes CodeMirror, DOMPurify, KaTeX, Remark Math, and Milkdown Kit dependencies;
- Crepe's published package is broad and should be treated as a prototype accelerator, not proof that the final bundle is acceptable.

Crepe currently documents these relevant features:

- CodeMirror-backed code blocks with language support and syntax highlighting;
- link tooltips;
- lists and task lists;
- image upload and captions;
- block handles and slash commands;
- table editing;
- inline and block LaTeX;
- floating and fixed toolbars;
- Markdown update events and `getMarkdown()`;
- optional AI streaming and accept/reject diff review.

If the prototype succeeds but Crepe's bundle, Vue dependency, or opinionated UI is unsuitable, retain Milkdown and rebuild the accepted surface with `@milkdown/kit` plus only the required components.

## T3 Code visual and interaction reference

The disposable reference checkout is:

```text
/home/semyon/code/external/t3code
```

It was reset to clean `origin/main` at commit `ecb35f75` on 2026-07-15. Recheck the remote before relying on exact line numbers.

Relevant files:

- `apps/web/src/components/ChatMarkdown.tsx`
  - `MarkdownCodeBlockTitleContent`
  - `MarkdownCodeBlock`
  - async Shiki rendering and fallback
- `apps/web/src/index.css`
  - `.chat-markdown-codeblock`
  - `.chat-markdown-codeblock-header`
  - `.chat-markdown-codeblock-title`
  - `.chat-markdown-chrome-action`
- `apps/web/src/pierre-icons.ts`
- `apps/web/src/components/chat/PierreEntryIcon.tsx`
- `apps/web/src/components/DiffPanel.tsx` for accessible wrap toggles and diff presentation

The 34 commits between the first review (`7b9eef7a`) and the refreshed checkout (`ecb35f75`) did not change the relevant chat code-block component, icon plumbing, highlighting, or diff controls.

### Code-block target

Use the T3 Code interaction pattern without copying its full renderer stack:

```text
┌─────────────────────────────────────┐
│ [language icon]          Wrap  Copy │
├─────────────────────────────────────┤
│ editable highlighted code           │
└─────────────────────────────────────┘
```

Initial behavior:

- display a language icon when it is specific and recognizable;
- otherwise display a short language label;
- give an icon-only language indicator a tooltip and accessible name;
- clicking the indicator in edit mode opens the language selector;
- use icon-only wrap and copy buttons with tooltips;
- expose `aria-pressed` on wrap;
- copy the raw code, not highlighted DOM;
- replace the copy icon with a checkmark briefly after success;
- preserve the fenced language in Markdown;
- keep all controls out of serialized Markdown;
- retain plaintext fallback when highlighting fails.

Future behavior, not part of the first release gate:

- persist a user-level line-wrap preference;
- optional line numbers;
- optional language auto-detection;
- filename/title UI only after a demonstrated need.

Milkdown's embedded CodeMirror should own editable code and highlighting. Do not transplant T3 Code's chat-specific Suspense/Shiki LRU cache into the editor unless profiling demonstrates a need. Do not adopt `@pierre/trees` solely for language icons; begin with a small explicit mapping and text fallback.

## Raw HTML strategy

Arbitrary HTML cannot safely or faithfully become ordinary rich-editor nodes. Implement a source-backed HTML block:

```text
┌ HTML ──────────────────── Edit source ┐
│ sanitized rendered preview            │
└───────────────────────────────────────┘
```

Requirements:

- retain the original HTML source as the node's canonical attribute/content;
- render preview through the same sanitization policy used by note read mode;
- never execute scripts, event handlers, unsafe protocols, or arbitrary JSX;
- provide an explicit source editor for the block;
- serialize the original/safely edited HTML back into Markdown;
- fall back to source rather than dropping malformed or unsupported HTML;
- map simple safe inline elements (`mark`, `kbd`, `sub`, `sup`) to normal marks/nodes only when round-trip behavior is proven;
- keep complex tables expressed as HTML opaque unless their structure can be represented without loss by the GFM table model.

## Implementation phases

### Phase 0: freeze and fixtures

- Treat the retired standalone CodeMirror editor as historical; add editor behavior only through the Milkdown surface and its compatibility contract.
- Expand `src/__tests__/fixtures/markdown-contract.md` with representative nested quotes/lists, multiple code languages, `diff`, complex math, hard breaks, safe HTML, opaque HTML, and malformed HTML.
- Add real imported-note fixtures separately when they can remain private/untracked; do not commit private note contents.
- Define semantic comparison rules so harmless Markdown normalization does not fail the spike.

### Phase 1: isolated prototype

- Add a client-only `MilkdownWriteEditor` alongside the current `WriteEditor`.
- Select it through a development/user feature flag.
- Load the current Markdown string as the initial value.
- Emit serialized Markdown through the existing `onChange(value, programmaticUpdate?)` boundary.
- Wire `Mod-s` to the existing save callback.
- Preserve external value synchronization without replacing local edits.
- Do not change database schemas, note API payloads, drafts, or export formats.

### Phase 2: core document features

- CommonMark and GFM schema;
- headings, marks, links, lists, tasks, quotes, rules;
- tables;
- KaTeX inline/block math;
- images and existing note upload/asset resolution;
- T3-inspired code-block controls;
- keyboard shortcuts, slash menu, selection toolbar, undo/redo;
- accessible focus and keyboard behavior.

### Phase 3: preservation extensions

- source-backed sanitized HTML node;
- fence metadata preservation;
- supported custom syntax plugins;
- Markdown/source escape hatch for advanced users;
- paste normalization from Markdown, HTML, browsers, and office applications.

### Phase 4: integration and release

- connect draft caching, dirty state, save queues, conflict detection, and cross-pane events;
- test mobile and IME input;
- profile long notes and editor loading;
- run the feature flag with representative notes;
- retain CodeMirror as a recovery path for at least the first rollout;
- update `markdown-rendering.md` only after the replacement is accepted;
- remove the old editor only in a later, explicit cleanup phase.

## Acceptance gates

The Milkdown candidate must pass all of these before becoming the default:

### Markdown fidelity

- Markdown → editor → Markdown retains semantic output for the contract fixture.
- Loading without editing does not trigger a destructive rewrite.
- Fenced languages, code text, math source, links, nested lists/quotes, table contents, task state, image paths, and supported HTML survive.
- Unsupported or malformed HTML is retained as source rather than discarded.
- Existing read mode renders the serialized result correctly.

### Interaction

- clicking a visible line/block places the cursor in that block;
- arrow keys, Home/End, selection, copy/paste, undo/redo, Tab behavior, and block boundaries work;
- nested list and blockquote creation/exiting is predictable;
- links can be edited and deliberately opened;
- code language selection, copy, wrap, indentation, and fence exit work;
- math can be created and its LaTeX edited;
- tables support keyboard navigation and row/column operations;
- screen-reader labels and keyboard focus are present for non-text controls.

### Platform and resilience

- Chrome, Firefox, and Safari-supported behavior;
- mobile selection and virtual keyboard behavior;
- IME composition and non-English keyboards;
- draft restoration, offline/local cache, save retries, conflict warnings, and cross-pane updates;
- no note loss when switching files or closing with unsaved changes;
- highlighting/math failures degrade to editable source rather than breaking the editor.

### Performance

- measure the feature-selected editor chunk rather than package unpacked size;
- compare initial editor load against the current CodeMirror surface;
- test a long note with many code blocks, equations, tables, and images;
- avoid eager language/highlighter loading where practical;
- use Crepe Builder or Milkdown Kit to remove unused features if the prototype bundle is excessive.

## Source-checking workflow

Product/editor packages are volatile. Before implementation, verify current versions, documentation status, licenses, and breaking changes from primary sources.

Useful commands:

```bash
npm view @milkdown/crepe version license dist.unpackedSize dependencies --json
npm view @milkdown/kit version license dist.unpackedSize --json
npm view @tiptap/core version license dist.unpackedSize --json
npm view @tiptap/markdown version license dist.unpackedSize --json
```

Refresh the disposable T3 Code reference only when needed:

```bash
cd /home/semyon/code/external/t3code
git fetch origin main
git reset --hard origin/main
git clean -fd
```

This checkout is explicitly disposable for comparison. Do not apply that reset/clean workflow to OghmaNotes.

## Official sources

### Milkdown

- [Documentation](https://milkdown.dev/docs)
- [Architecture overview](https://milkdown.dev/docs/guide/architecture-overview)
- [Crepe API and feature reference](https://milkdown.dev/docs/api/crepe)
- [Using Crepe](https://milkdown.dev/docs/guide/using-crepe)
- [Code-block component](https://milkdown.dev/docs/api/component-code-block)
- [Table-block component](https://milkdown.dev/docs/api/component-table-block)
- [Plugin catalogue](https://milkdown.dev/docs/plugin/using-plugins)
- [Transformer API](https://milkdown.dev/docs/api/transformer)
- [Custom marker syntax example](https://milkdown.dev/docs/plugin/example-marker-plugin)
- [Repository and releases](https://github.com/Milkdown/milkdown)

### Tiptap fallback

- [Markdown overview and limitations](https://tiptap.dev/docs/editor/markdown)
- [Markdown installation and GFM configuration](https://tiptap.dev/docs/editor/markdown/getting-started/installation)
- [Custom Markdown extension integration](https://tiptap.dev/docs/editor/markdown/guides/integrate-markdown-in-your-extension)
- [React node views](https://tiptap.dev/docs/editor/extensions/custom-extensions/node-views/react)
- [Code blocks](https://tiptap.dev/docs/editor/extensions/nodes/code-block)
- [Tables](https://tiptap.dev/docs/editor/extensions/nodes/table)
- [Mathematics](https://tiptap.dev/docs/editor/extensions/nodes/mathematics)

### Other candidates and boundaries

- [ProseMirror guide](https://prosemirror.net/docs/guide/)
- [CodeMirror decoration rules](https://codemirror.net/examples/decoration/)
- [BlockNote Markdown limitations](https://www.blocknotejs.org/docs/features/import/markdown)
- [Plate Markdown conversion](https://platejs.org/docs/markdown)
- [Toast UI Editor](https://ui.toast.com/tui-editor/)
- [Lexical](https://lexical.dev/)
- [MDX format](https://mdxjs.com/docs/what-is-mdx/)
- [MDX integration and security warning](https://mdxjs.com/docs/getting-started/)

## First implementation task

The next phase should be a bounded spike, not a production replacement:

1. create the feature-flagged Milkdown editor shell;
2. load and serialize the existing contract fixture;
3. wire the current `onChange`/`onSave` boundary;
4. enable GFM, tables, links, code, math, and basic images;
5. implement the minimal T3-style code controls;
6. report fidelity gaps, bundle cost, cursor/mobile behavior, and HTML requirements;
7. stop and request approval before migrating production behavior.
