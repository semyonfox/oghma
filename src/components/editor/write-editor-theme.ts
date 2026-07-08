import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

const editorMono =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';

const writeThemeSpec = {
  "&": {
    height: "100%",
    fontSize: "16px",
    lineHeight: "1.65",
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
    color: "var(--md-text)",
    caretColor: "var(--md-text)",
  },
  ".cm-line": {
    padding: "0.08rem 0",
  },
  ".cm-gutters": {
    display: "none",
  },
  ".cm-activeLine": {
    backgroundColor: "var(--md-active-line)",
  },
  ".cm-selectionBackground": {
    backgroundColor: "var(--md-selection) !important",
  },
  "&.cm-focused .cm-selectionBackground": {
    backgroundColor: "var(--md-selection) !important",
  },
  ".cm-cursor": {
    borderLeftColor: "var(--md-text)",
  },
  ".cm-header": {
    letterSpacing: "-0.025em",
  },
  ".cm-header-1": {
    color: "var(--md-heading-1)",
    fontSize: "2.65em",
    fontWeight: "750",
    lineHeight: "1.08",
  },
  ".cm-header-2": {
    color: "var(--md-heading-2)",
    fontSize: "2.05em",
    fontWeight: "700",
    lineHeight: "1.12",
  },
  ".cm-header-3": {
    color: "var(--md-heading-3)",
    fontSize: "1.55em",
    fontWeight: "650",
    lineHeight: "1.2",
  },
  ".cm-header-4": {
    color: "var(--md-heading-3)",
    fontSize: "1.28em",
    fontWeight: "650",
    lineHeight: "1.28",
  },
  ".cm-header-5, .cm-header-6": {
    color: "var(--md-heading-3)",
    fontSize: "1.1em",
    fontWeight: "650",
    lineHeight: "1.35",
  },
  ".cm-strong": { fontWeight: "750", color: "var(--md-strong)" },
  ".cm-em": { color: "var(--md-emphasis)", fontStyle: "italic" },
  ".cm-strikethrough": {
    color: "var(--md-strike)",
    textDecoration: "line-through",
  },
  ".cm-url, .cm-link": {
    color: "var(--md-link)",
    textDecoration: "underline",
    textUnderlineOffset: "3px",
  },
  ".cm-monospace, .cm-inlineCode": {
    fontFamily: editorMono,
  },
  ".cm-inlineCode": {
    backgroundColor: "var(--md-inline-code-bg)",
    border: "1px solid var(--md-inline-code-border)",
    borderRadius: "0.25rem",
    color: "var(--md-inline-code-text)",
    padding: "0.1em 0.35em",
  },
  ".cm-formatting, .cm-meta": {
    color: "var(--md-text-faint)",
  },
  ".cm-formatting-header": {
    color: "var(--md-heading-marker)",
    fontWeight: "650",
  },
  ".cm-quote": {
    color: "var(--md-quote-text)",
    backgroundColor: "var(--md-quote-bg)",
  },
  ".cm-md-render-marker": {
    color: "var(--md-accent)",
    display: "inline-block",
    fontWeight: "600",
    minWidth: "1.25ch",
    paddingRight: "0.25ch",
  },
  ".cm-md-render-checkbox": {
    color: "var(--md-accent)",
    display: "inline-block",
    fontWeight: "700",
    minWidth: "1.45ch",
    paddingRight: "0.35ch",
  },
  "@media (min-width: 768px)": {
    ".cm-scroller": {
      paddingLeft: "2rem",
      paddingRight: "2rem",
    },
  },
};

const oghmaHighlightStyle = HighlightStyle.define([
  { tag: t.heading, color: "var(--md-heading-3)", fontWeight: "700" },
  { tag: t.heading1, color: "var(--md-heading-1)", fontWeight: "750" },
  { tag: t.heading2, color: "var(--md-heading-2)", fontWeight: "700" },
  { tag: t.heading3, color: "var(--md-heading-3)", fontWeight: "650" },
  { tag: t.strong, color: "var(--md-strong)", fontWeight: "750" },
  { tag: t.emphasis, color: "var(--md-emphasis)", fontStyle: "italic" },
  { tag: t.strikethrough, color: "var(--md-strike)", textDecoration: "line-through" },
  {
    tag: [t.link, t.url],
    color: "var(--md-link)",
    textDecoration: "underline",
  },
  {
    tag: [t.monospace, t.processingInstruction],
    color: "var(--md-inline-code-text)",
    fontFamily: editorMono,
  },
  { tag: [t.meta, t.punctuation], color: "var(--md-text-faint)" },
  { tag: t.comment, color: "var(--md-syntax-comment)", fontStyle: "italic" },
  {
    tag: [t.keyword, t.atom, t.bool, t.special(t.variableName)],
    color: "var(--md-syntax-keyword)",
  },
  { tag: [t.string, t.regexp], color: "var(--md-syntax-string)" },
  { tag: [t.number, t.integer, t.float], color: "var(--md-syntax-number)" },
  {
    tag: [t.function(t.variableName), t.definition(t.function(t.variableName))],
    color: "var(--md-syntax-function)",
  },
  { tag: [t.typeName, t.className], color: "var(--md-syntax-type)" },
  { tag: [t.variableName, t.propertyName], color: "var(--md-syntax-variable)" },
  { tag: [t.deleted, t.invalid], color: "var(--md-syntax-invalid)" },
]);

export function themeExtensions(dark: boolean) {
  return [
    EditorView.theme(writeThemeSpec, { dark }),
    syntaxHighlighting(oghmaHighlightStyle),
  ];
}
