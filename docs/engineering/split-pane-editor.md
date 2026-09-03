# Split-Pane Editor

> **Status:** Active behaviour contract
>
> **Last reviewed:** 2026-09-04
>
> **Source of truth:** [`split-editor-pane.tsx`](../../src/components/editor/split-editor-pane.tsx), [`editor-pane.tsx`](../../src/components/editor/editor-pane.tsx), [`layout.zustand.ts`](../../src/lib/notes/state/layout.zustand.ts), [`file-spec.ts`](../../src/lib/notes/utils/file-spec.ts), and [`save-indicator.ts`](../../src/lib/notes/state/save-indicator.ts)

The notes workspace shows one pane (A) by default and a second pane (B) once a
file is opened on the right. This document owns how files move between the two
panes and where the save affordance lives. The editor and renderer contract
itself belongs to [Markdown rendering](markdown-rendering.md).

Split is desktop-only. Below the `768px` breakpoint `SplitEditorPane` renders
pane A alone and forces `activePane` back to `A`.

## Moving files between panes

Pane headers are draggable. A drag writes a single typed entry —
`FILE_DRAG_MIME` (`application/x-oghmanotes-file`) — carrying
`{ file, sourcePane }`. Drops read it back through `parseFileDragPayload()`,
which validates every field and returns `null` rather than throwing. A drag
with no `sourcePane` came from the tree; one with a `sourcePane` is a pane-to-
pane move.

`handleDragOver` resolves the target continuously and stores it in `dropTarget`
so the pane can highlight before release. Pane B, and pane A while a secondary
pane exists, are their own targets. Only a lone pane A splits on the midpoint
of its own `getBoundingClientRect()`, so a right-side drop can create the split.
The midpoint is never taken from the viewport: the tree and right panel are not
symmetric, so `window.innerWidth / 2` points at the wrong pane at most widths.

The drop itself is one call to `placeFileInPane(file, target, source)`, and the
store owns the whole decision:

| `source` | Result |
|---|---|
| equals `target` | focus and selection only; the file does not move |
| a pane, `target` is the other pane | `paneA` and `paneB` trade in one update |
| pane A → empty pane B | rejected; a lone primary pane cannot vacate itself |
| absent (tree drag) | the file is written into `target` |

Keeping this in the store rather than the component is what makes a pane-to-
pane move a *swap*. The regression worth remembering: writing the dragged file
into the target without clearing the source destroys whatever the target held
and leaves the dragged file open twice. A single store transition also means
the exchange costs one render pass.

## Save affordance

The save button lives in the pane header, next to the filename. It used to be
absolutely positioned over the editor's toolbar row, which put a page-coloured
element on top of the toolbar surface and forced the toolbar to reserve dead
space at its right edge.

`MarkdownEditor` does not render the control. It publishes `{ state, save }`
into the `save-indicator` store and `EditorPane` renders it.

That store is keyed by **file id, not by pane**. This is deliberate: a
pane-keyed indicator would have to be re-synchronised by hand on every swap,
and any path that moved a file without knowing about the indicator would leave
the dirty marker on the wrong side. Keyed by file, the indicator travels with
the note for free and `placeFileInPane` needs no knowledge of it.

| State | Presentation | Interactive |
|---|---|---|
| `saved` | dimmed check glyph | no |
| `saving` | spinning arrow, `role="status"` | no |
| `dirty` | amber cloud-upload, "Unsaved" | click saves |
| `error` | red triangle, "Save failed" | click retries |

The text label is hidden below `md`; the icon and accessible name remain.
`Ctrl`/`Cmd`+`S` continues to work independently of the button.

Removing the floating button freed the editor toolbar to run the full width of
the pane. It scrolls horizontally with hidden scrollbars rather than wrapping,
so the full set of block and formatting options stays reachable in a narrow
split pane.

## Known cost

`EditorPane` renders `FileRenderer` with `key={file.fileId}`, and the key is
positional. Swapping panes therefore tears down and rebuilds both editors even
though nothing about either file changed. Two open notes also mean two live
Milkdown/Crepe instances, each with its own plugin stack, embedded CodeMirror,
mermaid rendering, fetch, and draft-debounce loop.

Three directions are open, none decided:

- **make pane B read-only by default,** with an explicit control to upgrade it
  to a full editor. Most side-by-side use in a notes app is reference-while-
  writing rather than editing in both places, and a rendered view costs a
  fraction of an editor instance.
- **restrict pane B by file type,** for example to PDFs and rendered notes.
  A narrower version of the same trade that needs no new control.
- **render both editors in a stable DOM order keyed by `fileId`** and swap
  sides with CSS ordering instead of swapping store fields. This is the only
  approach that makes a swap genuinely free, but it decouples pane identity
  from panel position and needs care around resize-handle sizing.

Until one is chosen, treat the second editor instance as a real and roughly
doubled cost rather than an incidental one.
