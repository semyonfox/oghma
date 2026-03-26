'use client';

import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { oneDark, oneDarkHighlightStyle } from '@codemirror/theme-one-dark';

interface CodeMirrorEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  placeholder?: string;
}

// custom theme overrides to blend with the app's dark background
const appTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '14px',
  },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    padding: '3rem 0 12rem 0',
    overflow: 'auto',
  },
  '.cm-content': {
    maxWidth: '65ch',
    margin: '0 auto',
    padding: '0 3rem',
  },
  '.cm-gutters': {
    display: 'none',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  '.cm-selectionBackground': {
    backgroundColor: 'rgba(99, 102, 241, 0.3) !important',
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: 'rgba(99, 102, 241, 0.3) !important',
  },
  '.cm-cursor': {
    borderLeftColor: '#e2e8f0',
  },
  // markdown-specific token styling
  '.cm-header-1': { fontSize: '1.6em', fontWeight: '700' },
  '.cm-header-2': { fontSize: '1.35em', fontWeight: '600' },
  '.cm-header-3': { fontSize: '1.15em', fontWeight: '600' },
  '.cm-strong': { fontWeight: '700' },
  '.cm-em': { fontStyle: 'italic' },
  '.cm-strikethrough': { textDecoration: 'line-through' },
  '.cm-url': { color: '#818cf8' },
  '.cm-link': { color: '#818cf8', textDecoration: 'underline' },
});

export default function CodeMirrorEditor({
  value,
  onChange,
  onSave,
  placeholder = '',
}: CodeMirrorEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // keep callbacks in refs so extensions don't go stale
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

  // create editor once on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const saveKeymap = keymap.of([{
      key: 'Mod-s',
      run: () => { onSaveRef.current?.(); return true; },
    }]);

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
        syntaxHighlighting(oneDarkHighlightStyle),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        oneDark,
        appTheme,
        EditorView.lineWrapping,
        cmPlaceholder(placeholder),
        updateListener,
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => { view.destroy(); viewRef.current = null; };
    // only create once on mount — value synced separately below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // sync external value changes (e.g. note switch, cross-pane sync)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
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
      className="h-full w-full bg-background text-text-secondary"
    />
  );
}
