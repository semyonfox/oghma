"use client";

import { useEffect, useRef } from "react";
import { Annotation, EditorState, Compartment, Transaction } from "@codemirror/state";
import {
  EditorView,
  keymap,
  placeholder as cmPlaceholder,
} from "@codemirror/view";
import {
  defaultKeymap,
  indentWithTab,
  history,
  historyKeymap,
} from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { oneDarkHighlightStyle } from "@codemirror/theme-one-dark";

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

const writeThemeSpec = {
  "&": {
    height: "100%",
    fontSize: "16px",
    lineHeight: "1.75",
    backgroundColor: "transparent",
  },
  ".cm-scroller": {
    fontFamily:
      'var(--font-sans), ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    padding: "2.75rem 1rem 12rem",
    overflow: "auto",
  },
  ".cm-content": {
    width: "100%",
    maxWidth: "72ch",
    margin: "0 auto",
    padding: "0",
    color: "var(--color-text)",
    caretColor: "var(--color-text)",
  },
  ".cm-line": {
    padding: "0.08rem 0",
  },
  ".cm-gutters": {
    display: "none",
  },
  ".cm-activeLine": {
    backgroundColor: "color-mix(in srgb, var(--color-surface) 42%, transparent)",
  },
  ".cm-selectionBackground": {
    backgroundColor: "rgba(99, 102, 241, 0.28) !important",
  },
  "&.cm-focused .cm-selectionBackground": {
    backgroundColor: "rgba(99, 102, 241, 0.28) !important",
  },
  ".cm-cursor": {
    borderLeftColor: "var(--color-text)",
  },
  ".cm-header": {
    color: "var(--color-text)",
    letterSpacing: "-0.025em",
  },
  ".cm-header-1": { fontSize: "2em", fontWeight: "750", lineHeight: "1.2" },
  ".cm-header-2": { fontSize: "1.55em", fontWeight: "700", lineHeight: "1.25" },
  ".cm-header-3": { fontSize: "1.25em", fontWeight: "650", lineHeight: "1.3" },
  ".cm-strong": { fontWeight: "750" },
  ".cm-em": { fontStyle: "italic" },
  ".cm-strikethrough": { textDecoration: "line-through" },
  ".cm-url, .cm-link": {
    color: "var(--color-primary-400)",
    textDecoration: "underline",
    textUnderlineOffset: "3px",
  },
  ".cm-monospace, .cm-inlineCode": {
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  },
  ".cm-formatting, .cm-meta": {
    color: "var(--color-text-tertiary)",
  },
  "@media (min-width: 768px)": {
    ".cm-scroller": {
      paddingLeft: "2rem",
      paddingRight: "2rem",
    },
  },
};

const themeCompartment = new Compartment();
const externalValueSync = Annotation.define<boolean>();

function isDarkTheme(): boolean {
  if (typeof document === "undefined") return true;
  return !document.documentElement.classList.contains("light");
}

function themeExtensions(dark: boolean) {
  return [
    EditorView.theme(writeThemeSpec, { dark }),
    syntaxHighlighting(dark ? oneDarkHighlightStyle : defaultHighlightStyle),
  ];
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
