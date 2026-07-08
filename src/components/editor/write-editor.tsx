"use client";

import { useEffect, useRef } from "react";
import {
  Annotation,
  EditorState,
  Compartment,
  RangeSetBuilder,
  Transaction,
} from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  keymap,
  placeholder as cmPlaceholder,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import {
  defaultKeymap,
  indentWithTab,
  history,
  historyKeymap,
} from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { themeExtensions } from "./write-editor-theme";

interface WriteEditorProps {
  value: string;
  onChange: (value: string, programmaticUpdate?: boolean) => void;
  onSave?: () => void;
  noteId?: string;
  placeholder?: string;
}

export const CODE_BLOCK_LANGUAGES = {
  txt: "Text",
  md: "Markdown",
  markdown: "Markdown",
  js: "JavaScript",
  jsx: "JSX",
  ts: "TypeScript",
  tsx: "TSX",
  json: "JSON",
  css: "CSS",
  html: "HTML",
  bash: "Bash",
  sh: "Shell",
  sql: "SQL",
  py: "Python",
  python: "Python",
};

export interface MarkdownSyntaxRange {
  from: number;
  to: number;
  replaceWith?: string;
  className?: string;
  taskMarker?: MarkdownTaskMarker;
}

export interface MarkdownTaskMarker {
  from: number;
  to: number;
  checkboxFrom: number;
  checkboxTo: number;
  checked: boolean;
}

const themeCompartment = new Compartment();
const externalValueSync = Annotation.define<boolean>();

class MarkdownMarkerWidget extends WidgetType {
  constructor(
    private readonly text: string,
    private readonly className = "cm-md-render-marker",
    private readonly taskMarker?: MarkdownTaskMarker,
  ) {
    super();
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = this.className;
    span.textContent = this.text;
    if (this.taskMarker) {
      span.setAttribute("role", "checkbox");
      span.setAttribute("aria-checked", String(this.taskMarker.checked));
      span.setAttribute(
        "aria-label",
        this.taskMarker.checked ? "Mark task incomplete" : "Mark task complete",
      );
      span.dataset.taskCheckbox = "true";
      span.dataset.checkboxFrom = String(this.taskMarker.checkboxFrom);
      span.dataset.checkboxTo = String(this.taskMarker.checkboxTo);
      span.dataset.checked = String(this.taskMarker.checked);
      span.tabIndex = -1;
    }
    return span;
  }

  eq(other: MarkdownMarkerWidget) {
    return (
      this.text === other.text &&
      this.className === other.className &&
      this.taskMarker?.checkboxFrom === other.taskMarker?.checkboxFrom &&
      this.taskMarker?.checkboxTo === other.taskMarker?.checkboxTo &&
      this.taskMarker?.checked === other.taskMarker?.checked
    );
  }

  ignoreEvent() {
    return false;
  }
}

function isDarkTheme(): boolean {
  if (typeof document === "undefined") return true;
  return !document.documentElement.classList.contains("light");
}

export function wrapMarkdownSelection(
  text: string,
  from: number,
  to: number,
  before: string,
  after = before,
  fallback = "text",
) {
  const selected = text.slice(from, to) || fallback;
  return {
    insert: `${before}${selected}${after}`,
    anchor: from + before.length,
    head: from + before.length + selected.length,
  };
}

export function markdownTaskMarkerForLine(
  lineText: string,
  lineFrom: number,
): MarkdownTaskMarker | null {
  const leadingWhitespace = lineText.match(/^\s*/)?.[0].length ?? 0;
  const text = lineText.slice(leadingWhitespace);
  const todo = text.match(/^([-*+]\s+\[)([ xX])(]\s+)/);
  if (!todo) return null;

  const markerFrom = lineFrom + leadingWhitespace;
  const checkboxFrom = markerFrom + todo[1].length;

  return {
    from: markerFrom,
    to: markerFrom + todo[0].length,
    checkboxFrom,
    checkboxTo: checkboxFrom + 1,
    checked: todo[2].toLowerCase() === "x",
  };
}

export function toggleMarkdownTask(
  text: string,
  checkboxFrom: number,
  checkboxTo = checkboxFrom + 1,
) {
  const current = text.slice(checkboxFrom, checkboxTo);
  if (current === " ") {
    return `${text.slice(0, checkboxFrom)}x${text.slice(checkboxTo)}`;
  }
  if (current === "x" || current === "X") {
    return `${text.slice(0, checkboxFrom)} ${text.slice(checkboxTo)}`;
  }
  return text;
}

function addInlinePairRanges(
  ranges: MarkdownSyntaxRange[],
  lineText: string,
  lineFrom: number,
  pattern: RegExp,
  markerLength: number,
) {
  for (const match of lineText.matchAll(pattern)) {
    if (match.index == null || !match[0]) continue;
    ranges.push(
      {
        from: lineFrom + match.index,
        to: lineFrom + match.index + markerLength,
      },
      {
        from: lineFrom + match.index + match[0].length - markerLength,
        to: lineFrom + match.index + match[0].length,
      },
    );
  }
}

export function markdownSyntaxRangesForLine(
  lineText: string,
  lineFrom: number,
  isActiveLine: boolean,
): MarkdownSyntaxRange[] {
  if (isActiveLine) return [];

  const ranges: MarkdownSyntaxRange[] = [];
  const leadingWhitespace = lineText.match(/^\s*/)?.[0].length ?? 0;
  const contentStart = lineFrom + leadingWhitespace;
  const text = lineText.slice(leadingWhitespace);

  const fence = text.match(/^```.*$/);
  if (fence) {
    ranges.push({ from: contentStart, to: lineFrom + lineText.length });
    return ranges;
  }

  const heading = text.match(/^(#{1,6})\s+/);
  if (heading) {
    ranges.push({ from: contentStart, to: contentStart + heading[0].length });
  }

  const taskMarker = markdownTaskMarkerForLine(lineText, lineFrom);
  if (taskMarker) {
    ranges.push({
      from: taskMarker.from,
      to: taskMarker.to,
      replaceWith: taskMarker.checked ? "✓" : "",
      className: taskMarker.checked
        ? "cm-md-render-checkbox cm-md-render-checkbox-checked"
        : "cm-md-render-checkbox",
      taskMarker,
    });
  } else {
    const unorderedList = text.match(/^[-*+]\s+/);
    if (unorderedList) {
      ranges.push({
        from: contentStart,
        to: contentStart + unorderedList[0].length,
        replaceWith: "•",
      });
    }
  }

  const blockquote = text.match(/^>\s*/);
  if (blockquote) {
    ranges.push({ from: contentStart, to: contentStart + blockquote[0].length });
  }

  addInlinePairRanges(ranges, lineText, lineFrom, /\*\*([^*]+)\*\*/g, 2);
  addInlinePairRanges(ranges, lineText, lineFrom, /__([^_]+)__/g, 2);
  addInlinePairRanges(ranges, lineText, lineFrom, /`([^`]+)`/g, 1);

  for (const match of lineText.matchAll(/\[([^\]]+)]\(([^)]+)\)/g)) {
    if (match.index == null || !match[0]) continue;
    const textStart = match.index + 1;
    const textEnd = textStart + match[1].length;
    ranges.push(
      { from: lineFrom + match.index, to: lineFrom + textStart },
      { from: lineFrom + textEnd, to: lineFrom + match.index + match[0].length },
    );
  }

  return ranges;
}

function buildMarkdownRenderDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const activeLine = view.state.doc.lineAt(view.state.selection.main.head);

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const ranges = markdownSyntaxRangesForLine(
        line.text,
        line.from,
        line.from === activeLine.from,
      )
        .filter((range) => range.from < range.to)
        .sort((a, b) => a.from - b.from || a.to - b.to);

      let lastTo = line.from;
      for (const range of ranges) {
        if (range.from < lastTo) continue;
        builder.add(
          range.from,
          range.to,
          Decoration.replace({
            widget: range.replaceWith !== undefined
              ? new MarkdownMarkerWidget(range.replaceWith, range.className, range.taskMarker)
              : undefined,
          }),
        );
        lastTo = range.to;
      }

      if (line.to >= to) break;
      pos = line.to + 1;
    }
  }

  return builder.finish();
}

function taskCheckboxElement(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  return target.closest<HTMLElement>("[data-task-checkbox='true']");
}

function toggleTaskCheckboxFromDom(view: EditorView, target: EventTarget | null): boolean {
  const checkbox = taskCheckboxElement(target);
  if (!checkbox) return false;

  const checkboxFrom = Number(checkbox.dataset.checkboxFrom);
  const checkboxTo = Number(checkbox.dataset.checkboxTo);
  const docLength = view.state.doc.length;
  if (
    !Number.isInteger(checkboxFrom) ||
    !Number.isInteger(checkboxTo) ||
    checkboxFrom < 0 ||
    checkboxTo > docLength
  ) {
    return true;
  }

  const docText = view.state.doc.toString();
  const line = view.state.doc.lineAt(checkboxFrom);
  const taskMarker = markdownTaskMarkerForLine(line.text, line.from);
  const activeLine = view.state.doc.lineAt(view.state.selection.main.head);
  if (
    !taskMarker ||
    line.from === activeLine.from ||
    taskMarker.checkboxFrom !== checkboxFrom ||
    taskMarker.checkboxTo !== checkboxTo
  ) {
    return true;
  }

  const toggled = toggleMarkdownTask(docText, checkboxFrom, checkboxTo);
  if (toggled === docText) return true;

  view.dispatch({
    changes: {
      from: checkboxFrom,
      to: checkboxTo,
      insert: taskMarker.checked ? " " : "x",
    },
    scrollIntoView: false,
  });
  view.focus();
  return true;
}

const taskCheckboxInteraction = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (!taskCheckboxElement(event.target)) return false;
    event.preventDefault();
    event.stopPropagation();
    return toggleTaskCheckboxFromDom(view, event.target);
  },
  click(event) {
    if (!taskCheckboxElement(event.target)) return false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  },
});

const markdownRenderDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildMarkdownRenderDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildMarkdownRenderDecorations(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
);

export default function WriteEditor({
  value,
  onChange,
  onSave,
  placeholder = "Start writing...",
}: WriteEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const destroyedRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    if (!containerRef.current) return;
    destroyedRef.current = false;

    const saveKeymap = keymap.of([
      {
        key: "Mod-s",
        run: () => {
          onSaveRef.current?.();
          return true;
        },
      },
    ]);

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const programmaticUpdate = update.transactions.some((transaction) =>
          transaction.annotation(externalValueSync),
        );
        onChangeRef.current(update.state.doc.toString(), programmaticUpdate);
      }
    });

    const state = EditorState.create({
      doc: value,
      extensions: [
        saveKeymap,
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        taskCheckboxInteraction,
        markdownRenderDecorations,
        themeCompartment.of(themeExtensions(isDarkTheme())),
        EditorView.lineWrapping,
        cmPlaceholder(placeholder),
        updateListener,
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    const themeObserver = new MutationObserver(() => {
      view.dispatch({
        effects: themeCompartment.reconfigure(themeExtensions(isDarkTheme())),
      });
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      destroyedRef.current = true;
      themeObserver.disconnect();
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || destroyedRef.current) return;
    const current = view.state.doc.toString();
    if (value !== current) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
        annotations: [
          externalValueSync.of(true),
          Transaction.addToHistory.of(false),
        ],
      });
    }
  }, [value]);

  const applyBlockPrefix = (prefix: string) => {
    const view = viewRef.current;
    if (!view) return;
    const { from } = view.state.selection.main;
    const line = view.state.doc.lineAt(from);
    view.dispatch({
      changes: { from: line.from, insert: prefix },
      selection: { anchor: line.from + prefix.length },
      scrollIntoView: true,
    });
    view.focus();
  };

  const wrapSelection = (before: string, after = before, fallback = "text") => {
    const view = viewRef.current;
    if (!view) return;
    const text = view.state.doc.toString();
    const { from, to } = view.state.selection.main;
    const wrapped = wrapMarkdownSelection(text, from, to, before, after, fallback);
    view.dispatch({
      changes: { from, to, insert: wrapped.insert },
      selection: { anchor: wrapped.anchor, head: wrapped.head },
      scrollIntoView: true,
    });
    view.focus();
  };

  const insertSnippet = (snippet: string, cursorOffset = snippet.length) => {
    const view = viewRef.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: snippet },
      selection: { anchor: from + cursorOffset },
      scrollIntoView: true,
    });
    view.focus();
  };

  return (
    <div className="oghma-write-editor flex h-full min-h-0 w-full flex-col bg-app-page">
      <div className="flex flex-shrink-0 items-center gap-1 border-b border-border-subtle bg-app-page/90 px-3 py-2 text-xs text-text-secondary backdrop-blur">
        <button className="rounded-radius-sm px-2 py-1 hover:bg-surface" onClick={() => applyBlockPrefix("# ")}>
          H1
        </button>
        <button className="rounded-radius-sm px-2 py-1 hover:bg-surface" onClick={() => applyBlockPrefix("## ")}>
          H2
        </button>
        <button
          className="rounded-radius-sm px-2 py-1 font-bold hover:bg-surface"
          onClick={() => wrapSelection("**", "**", "bold")}
        >
          B
        </button>
        <button
          className="rounded-radius-sm px-2 py-1 italic hover:bg-surface"
          onClick={() => wrapSelection("_", "_", "italic")}
        >
          I
        </button>
        <button className="rounded-radius-sm px-2 py-1 hover:bg-surface" onClick={() => applyBlockPrefix("- ")}>
          List
        </button>
        <button className="rounded-radius-sm px-2 py-1 hover:bg-surface" onClick={() => applyBlockPrefix("- [ ] ")}>
          Todo
        </button>
        <button className="rounded-radius-sm px-2 py-1 hover:bg-surface" onClick={() => applyBlockPrefix("> ")}>
          Quote
        </button>
        <button
          className="rounded-radius-sm px-2 py-1 hover:bg-surface"
          onClick={() => insertSnippet("```tsx\n\n```", 7)}
        >
          Code
        </button>
        <span className="ml-2 text-text-tertiary">Markdown stays canonical. Dynamic editor is still super beta.</span>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 bg-transparent text-text-secondary" />
    </div>
  );
}
