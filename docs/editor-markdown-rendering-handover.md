# Oghma editor + Markdown rendering handover

## TL;DR

Semyon wants Oghma to have a **single buttery writing surface**: normal users should just type like Notion, while advanced users can still use Markdown shortcuts naturally. Simplicity and “just works” UX matter more than exposing editor/view/source modes.

Important distinction:

- **CodeMirror is still the current editor engine.** It powers the active `WriteEditor` surface.
- The “better package” discussion was **not about replacing CodeMirror with MDX**. It was mostly about improving the **rendered Markdown/code-block experience**, likely via **Shiki** instead of `rehype-highlight`.
- MDX means Markdown + JSX/React components. That is probably **not** the product goal for Oghma notes.
- The product goal is better described as: **single-view Markdown-backed rich editor**.

## Current decision

Decision recovered from prior Discord/Codex-thread context:

- **Do not migrate the main editor package now.**
- Keep **CodeMirror 6** as the current write-surface engine for the next production version.
- Build product behaviour around **canonical Markdown**, with CodeMirror as adapter v1.
- Keep **Milkdown / Crepe** as a future editor-engine candidate only if CodeMirror polish proves insufficient; do not carry the old spike branch as active work.
- Do **not** use MDX/MDXEditor as the main note syntax/editor direction.
- Use **Shiki** for renderer/code-block highlighting polish, not as an editor replacement.
- Keep the UI as a single Notion-like writing surface: inactive Markdown syntax hides; raw syntax appears only where useful.
- Code-block chrome should stay minimal: copy-only/no always-visible word-wrap unless deliberately reintroduced later.

Source breadcrumbs:

- Discord session: `20260708_212713_8ccb8c`, message `50242`, “Markdown Editor Handover Setup”. Key quote: “**do not migrate the main editor package now** … **Keep CodeMirror as the editor engine** … **Milkdown is the escape hatch, not the first move**.”
- Discord session: `20260709_192556_2c1d6e60`, message `53464`, memory update: “Canonical MD/Notion-like editor, inactive syntax hides; avoid heavy editor stacks; Shiki renderer polish only; code blocks minimal chrome/copy-only/no always-visible word-wrap.”

## Current state on `dev`

### Active editor path

The editor path is currently CodeMirror-backed:

- `src/components/editor/markdown-editor.tsx`
  - dynamically imports `./write-editor`
  - manages loading/saving/drafts/dirty state
- `src/components/editor/write-editor.tsx`
  - imports and instantiates CodeMirror:
    - `@codemirror/state`
    - `@codemirror/view`
    - `@codemirror/commands`
    - `@codemirror/lang-markdown`
    - `@codemirror/language-data`
  - provides a single `Write` surface
  - hides Markdown syntax on inactive lines via CodeMirror decorations
  - keeps active line raw/editable
  - toolbar inserts Markdown prefixes/wrappers
- `src/components/editor/write-editor-theme.ts`
  - CodeMirror theme + highlight styling

The old `source-editor.tsx` was deleted, but CodeMirror was **not** removed. It was replaced by a newer `write-editor.tsx` that is still CodeMirror under the hood.

### Why the branch names are misleading

Recent PRs had branch names like:

- `feat/mdx-write-mode`
- `feat/mdx-live-rendered-write`

But they did **not** land an MDX editor package. PR #351 explicitly described the feature as a “CodeMirror markdown surface”, and the diff added CodeMirror imports in `write-editor.tsx`.

No active editor dependency was found for:

- `@mdxeditor/editor`
- `@mdx-js/*`
- `next-mdx-remote`
- Milkdown
- Tiptap

Historical note: Lexical existed previously, but a prior cleanup removed the dead Lexical editor stack.

## Current rendered Markdown pipeline

Markdown rendering currently uses React Markdown / remark / rehype:

- `react-markdown`
- `remark-gfm`
- `remark-math`
- `rehype-katex`
- `rehype-raw`
- `rehype-sanitize`
- `rehype-highlight`

Relevant files:

- `src/components/editor/preview-renderer.tsx`
- `src/components/chat/chat-markdown.tsx`
- `src/components/quiz/quiz-markdown.tsx`
- `src/lib/markdown/renderer.tsx`
- `src/lib/markdown/components/code-block.tsx`
- `src/lib/markdown/sanitize-schema.ts`

Current smell: renderer stacks are not fully centralized.

Observed examples:

- editor preview uses `rehypeHighlight` plus sanitize
- chat markdown uses `rehypeHighlight` plus sanitize
- quiz markdown uses `rehypeHighlight` only, which looks under-sanitized unless quiz content is guaranteed trusted

## Product goal Semyon described

Semyon wants:

- one view, like Notion
- no explicit switching between editor and rendered/preview/source modes for average users
- normal users type and it just behaves like a polished document editor
- advanced users can use Markdown syntax/shortcuts if they want
- Markdown should remain portable/canonical where possible
- code blocks/tables/tasks/math/links should feel polished, not GitHub-ish bolted-on rendering
- simplicity for the average user is key

This goal is **not MDX**. MDX is useful for docs/blogs where users write React components inside Markdown. Oghma should probably avoid exposing JSX/component authoring as normal note syntax.

Better label: **Markdown-backed rich text editor** or **single-view Markdown-first editor**.

## Important terminology

### Markdown

Plain text formatting syntax:

```md
# Heading

- item

```ts
console.log("hi")
```
```

### MDX

Markdown plus JSX/React components:

```mdx
# Heading

<MyChart data={stats} />

<Callout type="warning">
  Custom React component inside the document.
</Callout>
```

MDX is probably not the desired editing model for Oghma. It adds conceptual weight and a security/product surface Oghma likely does not need.

### Shiki

A syntax highlighter that produces higher-quality code highlighting than Highlight.js. This is probably the “better package” Semyon was remembering for rendered code blocks.

Shiki is relevant to **rendering code blocks**, not replacing the editor engine by itself.

## Recommendations

### Do not rip out CodeMirror yet

CodeMirror is currently doing the boring hard part reliably:

- cursor/selection behavior
- Markdown text fidelity
- keyboard handling
- canonical Markdown editing
- syntax highlighting/decorations

The user pain may be partly editor feel, but a lot of the visible weakness is currently in rendered Markdown/code-block polish.

### Explore editor alternatives in spikes, not a rewrite

If the goal is a genuinely buttery Notion-like single view, CodeMirror may eventually hit a ceiling because it is still a text/code editor underneath. Explore alternatives in throwaway branches before committing.

Best candidates:

#### 1. Milkdown

Likely the most philosophically aligned option.

- ProseMirror-based
- Markdown-first
- rich/WYSIWYG-ish single surface
- Markdown import/export is core, not an afterthought
- good fit for “normal user just writes, advanced user can use Markdown”

Risks:

- ProseMirror complexity
- plugin/theming work
- verify Markdown fidelity for tables/tasks/code/math/callouts

#### 2. `@mdxeditor/editor`

Worth a fast spike despite the MDX name.

Potential benefits:

- polished Markdown/MDX rich editor
- toolbar/plugins out of the box
- quick to evaluate
- may provide the “buttery” feel faster than building it manually

Risks:

- MDX conceptual baggage
- may emit/encourage MDX-ish structures unless constrained
- theming/control may fight Oghma
- must verify plain Markdown round-tripping

#### 3. Lexical

High UX ceiling, but risky if Markdown must remain canonical.

Benefits:

- very smooth rich-text engine
- React-friendly
- suitable for Notion/Docs-like surfaces

Risks:

- native model is editor state, not Markdown
- Markdown import/export edge cases become Oghma’s problem
- tables/code/math/tasks could get cursed fast

#### 4. Tiptap

Good rich editor, but Markdown is not its natural canonical model.

Benefits:

- mature ProseMirror wrapper
- Notion-ish UX possible
- strong ecosystem

Risks:

- HTML/ProseMirror JSON is the natural source of truth
- Markdown fidelity requires extra machinery

#### 5. Textarea/contenteditable fallback

Low-complexity escape hatch.

Benefits:

- very simple
- portable Markdown
- no heavy editor framework

Risks:

- not truly buttery
- no structured blocks/decorations without rebuilding editor features

### Suggested editor spike checklist

For Milkdown and MDXEditor, test the same sample note and inspect both UX and Markdown round-trip:

- headings via `# ` shortcut
- bullet/numbered lists
- nested lists
- task lists
- blockquotes
- code fences with language
- code fence metadata/title, e.g. ` ```ts title="src/foo.ts" `
- unknown languages, e.g. `gitignore`
- tables
- links
- inline code
- bold/italic
- math if supported/needed
- paste Markdown in
- copy Markdown out
- dark theme
- mobile-ish width behavior
- bundle impact
- SSR/client-only behavior in Next
- XSS/security behavior for pasted HTML and code fences

Success criterion: a normal user never thinks about Markdown, but a technical user can still type Markdown shortcuts and get predictable portable Markdown output.

## Recommended implementation sequence for renderer polish

The renderer work is separable from the editor-engine question and is probably worth doing regardless.

### PR 1: CodeBlock UX, keep Highlight.js for now

Low-risk, visible improvement.

Current `CodeBlock` is basic:

- header only appears when language exists
- copy button is hover-only
- no wrap toggle
- no title/meta parsing
- no language alias normalization
- no clear no-language/unknown-language behavior

Add:

- always-visible header
- `CODE` fallback label
- copy button always available
- copied state feedback
- word-wrap toggle
- language alias map
- title/meta parsing from fences
- unknown language fallback
- better empty/no-language handling

Supported fence examples:

````md
```ts title="src/foo.ts"
console.log("hello");
```
````

````md
```gitignore
node_modules
.env
```
````

Language aliases to consider:

- `js` -> `javascript`
- `ts` -> `typescript`
- `tsx` -> `tsx`
- `jsx` -> `jsx`
- `sh`, `shell`, `zsh` -> `bash` or `shell`
- `yml` -> `yaml`
- `md` -> `markdown`
- `py` -> `python`
- `gitignore` -> `ini` or `text/plain` fallback depending highlighter support
- unknown -> plaintext

### PR 2: Shiki replacement for `rehype-highlight`

This is the real quality bump.

Recommendation: direct Shiki wrapper, not `react-shiki`, because Oghma wants control over:

- theme
- dark mode
- code chrome
- copy behavior
- wrapping
- caching
- fallback behavior
- bundle size

Intended final shape:

```tsx
<ReactMarkdown
  remarkPlugins={[remarkGfm, remarkMath, remarkPreserveCodeMeta]}
  rehypePlugins={[
    rehypeRaw,
    rehypeKatex,
    [rehypeSanitize, markdownSanitizeSchema],
  ]}
  components={{
    code: CodeBlock,
    pre: PreWrapper,
  }}
>
  {markdown}
</ReactMarkdown>
```

No `rehypeHighlight`. `CodeBlock` owns syntax highlighting.

Shiki perf notes:

- lazy highlighter init
- cache by `theme + language + codeHash`
- normalize language before lookup
- plaintext fallback
- debounce or avoid expensive live preview highlighting while typing
- editor preview is riskier than chat/quiz because it can re-render constantly

Security notes:

- If using Shiki `codeToHtml()` + `dangerouslySetInnerHTML`, inject only Shiki-generated HTML, never raw Markdown or user HTML.
- Shiki HTML may bypass the earlier `rehype-sanitize` step because it is inserted later inside React component rendering.
- Safety must live in `CodeBlock` implementation and tests.

Add malicious code tests like:

````md
```html
</span><script>alert("xss")</script>
```
````

Expected: renders as code text/tokens, never executable HTML/script.

### PR 3: Renderer consolidation

Current duplicated stacks are a maintenance smell.

Long-term target options:

```ts
createMarkdownComponents({
  mode: "editor" | "chat" | "quiz",
  allowRawHtml: boolean,
  enableMath: boolean,
  enableTables: boolean,
})
```

or one shared component:

```tsx
<MarkdownRenderer variant="editor" />
<MarkdownRenderer variant="chat" />
<MarkdownRenderer variant="quiz" />
```

Goal: editor/chat/quiz share the same safe markdown foundation, with explicit variant differences instead of copy-pasted plugin stacks.

### PR 4: Optional polish

- better table chrome
- table copy/export actions
- task-list UX
- file-link actions
- callout syntax
- Mermaid support only if needed, lazy-loaded

## Security boundary

Be strict here.

Rules:

- Raw note Markdown is untrusted unless proven otherwise.
- Raw quiz/chat Markdown should also be treated carefully unless source is guaranteed trusted.
- `rehypeRaw` requires a strict `rehypeSanitize` schema.
- If Shiki generates HTML later in `CodeBlock`, sanitize assumptions from the ReactMarkdown pipeline do not automatically apply.
- Never inject raw code content as HTML.
- Test code fences that contain HTML/script-looking strings.

## What not to do

- Do not “port T3’s whole Markdown layer”. It will drag in agent-chat-specific architecture and become a swamp.
- Do not turn Oghma notes into an MDX/component authoring product unless explicitly decided later.
- Do not do CodeBlock UX, Shiki swap, renderer consolidation, and editor-engine replacement in one mega PR.
- Do not remove CodeMirror until an alternative spike proves Markdown fidelity, UX, performance, and security.

## Practical next steps for another agent

1. Confirm current `dev` state with:

```bash
git fetch origin
git checkout dev
git pull --ff-only
rg "@codemirror|rehypeHighlight|rehype-highlight|ReactMarkdown|CodeBlock|rehypeSanitize" src package.json
```

2. If doing renderer polish first, open a branch for **CodeBlock UX only**.

Suggested files:

- `src/lib/markdown/components/code-block.tsx`
- `src/lib/markdown/renderer.tsx`
- `src/__tests__/lib/preview-renderer.test.ts`
- maybe add dedicated `code-block` tests if component testing setup supports it

3. Keep `rehype-highlight` for that first PR. Do not mix in Shiki yet.

4. Add tests for:

- no-language block gets `CODE`
- known language label displays normalized label
- alias language works
- title/meta is parsed/displayed
- copy uses raw content, not highlighted/HTML text
- wrap toggle changes class/state
- unknown language does not crash

5. If doing editor exploration, create throwaway spike branches:

- `spike/milkdown-write-editor`
- `spike/mdxeditor-write-editor`

Do not preserve these as production PRs until they pass the spike checklist above.

## Final interpretation

Semyon’s actual desired direction:

> A single Notion-like writing surface where Markdown is available but invisible unless useful, backed by portable Markdown where possible, with polished rendering for code/tables/math/tasks.

Nearest technical label:

> Markdown-backed rich text editor + centralized safe Markdown renderer.

Current implementation:

> CodeMirror-backed Markdown write surface + ReactMarkdown/rehype-highlight renderer.

Likely near-term best work:

1. Improve CodeBlock UX.
2. Replace `rehype-highlight` with Shiki safely.
3. Consolidate Markdown renderers.
4. Separately spike Milkdown/MDXEditor as possible replacements for CodeMirror if the current editor cannot reach the desired feel.
