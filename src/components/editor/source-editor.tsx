"use client";

import { useEffect, useRef } from "react";
import { EditorState, Compartment } from "@codemirror/state";
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

interface CodeMirrorEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  placeholder?: string;
}

// editor theme spec — colors use CSS variables so they adapt to the active light/dark class
const appThemeSpec = {
    "&": {
      height: "100%",
      fontSize: "15px",
      lineHeight: "1.6",
      backgroundColor: "transparent",
    },
    ".cm-scroller": {
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
      padding: "3rem 1rem 12rem",
      overflow: "auto",
    },
    ".cm-content": {
      width: "100%",
      maxWidth: "68ch",
      margin: "0 auto",
      padding: "0",
      color: "var(--color-text)",
      caretColor: "var(--color-text)",
    },
    ".cm-gutters": {
      display: "none",
    },
    ".cm-activeLine": {
      backgroundColor: "var(--color-subtle)",
    },
    ".cm-selectionBackground": {
      backgroundColor: "rgba(99, 102, 241, 0.3) !important",
    },
    "&.cm-focused .cm-selectionBackground": {
      backgroundColor: "rgba(99, 102, 241, 0.3) !important",
    },
    ".cm-cursor": {
      borderLeftColor: "var(--color-text)",
    },
    // markdown-specific token styling
    ".cm-header-1": { fontSize: "1.6em", fontWeight: "700", lineHeight: "1.1" },
    ".cm-header-2": { fontSize: "1.35em", fontWeight: "600", lineHeight: "1.1" },
    ".cm-header-3": { fontSize: "1.15em", fontWeight: "600", lineHeight: "1.15" },
    ".cm-strong": { fontWeight: "700" },
    ".cm-em": { fontStyle: "italic" },
    ".cm-strikethrough": { textDecoration: "line-through" },
    ".cm-url": { color: "var(--color-primary-400)" },
    ".cm-link": { color: "var(--color-primary-400)", textDecoration: "underline" },
    "@media (min-width: 768px)": {
      ".cm-scroller": {
        paddingLeft: "2rem",
        paddingRight: "2rem",
      },
    },
    "@media (min-width: 1024px)": {
      ".cm-scroller": {
        paddingLeft: "2.5rem",
        paddingRight: "2.5rem",
      },
    },
};

const themeCompartment = new Compartment();

function isDarkTheme(): boolean {
  if (typeof document === "undefined") return true;
  return !document.documentElement.classList.contains("light");
}

// theme + syntax highlight as one swappable unit, so a light/dark flip
// reconfigures both without recreating the editor or injecting CSS after load
function themeExtensions(dark: boolean) {
  return [
    EditorView.theme(appThemeSpec, { dark }),
    syntaxHighlighting(dark ? oneDarkHighlightStyle : defaultHighlightStyle),
  ];
}

export default function CodeMirrorEditor({
  value,
  onChange,
  onSave,
  placeholder = "",
}: CodeMirrorEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const destroyedRef = useRef(false);
  // keep callbacks in refs so extensions don't go stale
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  // create editor once on mount
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
        onChangeRef.current(update.state.doc.toString());
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

    // re-apply theme + highlight when the app's light/dark class flips
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
    // only create once on mount — value synced separately below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // sync external value changes (e.g. note switch, cross-pane sync)
  useEffect(() => {
    const view = viewRef.current;
    if (!view || destroyedRef.current) return;
    const current = view.state.doc.toString();
    if (value !== current) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full bg-transparent text-text-secondary"
    />
  );
}
