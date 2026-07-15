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
    maxWidth: "var(--editor-write-max-width, 72ch)",
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
  ".cm-code-cell-line": {
    backgroundColor: "var(--md-code-bg)",
    borderLeft: "1px solid var(--md-code-border)",
    borderRight: "1px solid var(--md-code-border)",
    fontFamily: editorMono,
    paddingLeft: "0.9rem",
    paddingRight: "0.9rem",
  },
  ".cm-code-cell-first": {
    borderTop: "1px solid var(--md-code-border)",
    borderTopLeftRadius: "0.65rem",
    borderTopRightRadius: "0.65rem",
    marginTop: "0.65rem",
    paddingTop: "0.42rem",
  },
  ".cm-code-cell-last": {
    borderBottom: "1px solid var(--md-code-border)",
    borderBottomLeftRadius: "0.65rem",
    borderBottomRightRadius: "0.65rem",
    marginBottom: "0.65rem",
    paddingBottom: "0.42rem",
  },
  ".cm-code-cell-header": {
    alignItems: "center",
    color: "var(--md-text-faint)",
    display: "inline-flex",
    fontFamily:
      'var(--font-sans), ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: "0.72rem",
    gap: "0.6rem",
    letterSpacing: "0.04em",
    minHeight: "1.35rem",
    textTransform: "uppercase",
  },
  ".cm-code-cell-language": {
    color: "var(--md-accent)",
    fontWeight: "700",
  },
  ".cm-code-cell-title": {
    color: "var(--md-text-faint)",
    fontWeight: "500",
    letterSpacing: "normal",
    overflow: "hidden",
    textOverflow: "ellipsis",
    textTransform: "none",
    whiteSpace: "nowrap",
  },
  ".cm-md-table-scroll": {
    margin: "0.7rem 0",
    maxWidth: "100%",
    overflowX: "auto",
  },
  ".cm-md-table": {
    border: "1px solid var(--md-code-border)",
    borderCollapse: "separate",
    borderRadius: "0.65rem",
    borderSpacing: "0",
    color: "var(--md-text-muted)",
    minWidth: "100%",
    overflow: "hidden",
  },
  ".cm-md-table th, .cm-md-table td": {
    borderBottom: "1px solid var(--md-code-border)",
    borderRight: "1px solid var(--md-code-border)",
    minWidth: "7rem",
    padding: "0.6rem 0.8rem",
    verticalAlign: "top",
  },
  ".cm-md-table th": {
    backgroundColor: "var(--md-surface-subtle)",
    color: "var(--md-text)",
    fontWeight: "650",
  },
  ".cm-md-table tr:last-child td": { borderBottom: "0" },
  ".cm-md-table th:last-child, .cm-md-table td:last-child": {
    borderRight: "0",
  },
  ".cm-md-inline-html-mark": {
    backgroundColor: "color-mix(in srgb, var(--md-accent) 24%, transparent)",
    borderRadius: "0.18rem",
    color: "var(--md-text)",
    padding: "0 0.12em",
  },
  ".cm-md-inline-html-kbd": {
    backgroundColor: "var(--md-surface-subtle)",
    border: "1px solid var(--md-code-border)",
    borderBottomWidth: "2px",
    borderRadius: "0.28rem",
    color: "var(--md-text)",
    fontFamily: editorMono,
    fontSize: "0.82em",
    padding: "0.08em 0.35em",
  },
  ".cm-md-inline-html-sub, .cm-md-inline-html-sup": {
    fontSize: "0.75em",
    lineHeight: "0",
    position: "relative",
    verticalAlign: "baseline",
  },
  ".cm-md-inline-html-sub": { bottom: "-0.25em" },
  ".cm-md-inline-html-sup": { top: "-0.5em" },
  ".cm-md-horizontal-rule": {
    borderTop: "1px solid var(--md-code-border)",
    display: "inline-block",
    margin: "0.8rem 0 0.3rem",
    width: "100%",
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
  ".cm-math-inline": {
    color: "var(--md-strong)",
    display: "inline-block",
    fontFamily: "KaTeX_Main, var(--font-serif), serif",
    padding: "0 0.08em",
    verticalAlign: "baseline",
  },
  ".cm-math-inline .katex": {
    fontSize: "1.02em",
  },
  ".cm-math-display": {
    backgroundColor: "color-mix(in srgb, var(--md-inline-code-bg) 62%, transparent)",
    border: "1px solid var(--md-inline-code-border)",
    borderRadius: "0.75rem",
    color: "var(--md-text)",
    display: "block",
    margin: "0.6rem 0",
    overflowX: "auto",
    padding: "0.85rem 1rem",
    textAlign: "center",
  },
  ".cm-math-display .katex-display": {
    margin: "0",
  },
  ".cm-math-inline .katex-error, .cm-math-display .katex-error": {
    color: "var(--md-text-faint)",
  },
  ".cm-math-invalid": {
    color: "var(--md-text-faint)",
    fontFamily: editorMono,
    fontSize: "0.95em",
  },
  "@media (min-width: 768px)": {
    ".cm-scroller": {
      paddingLeft: "2rem",
      paddingRight: "2rem",
    },
  },
};

const oghmaHighlightStyle = HighlightStyle.define([
  {
    tag: t.heading,
    color: "var(--md-heading-3)",
    fontWeight: "700",
    letterSpacing: "-0.025em",
  },
  {
    tag: t.heading1,
    color: "var(--md-heading-1)",
    fontSize: "2.65em",
    fontWeight: "750",
    lineHeight: "1.08",
    letterSpacing: "-0.025em",
  },
  {
    tag: t.heading2,
    color: "var(--md-heading-2)",
    fontSize: "2.05em",
    fontWeight: "700",
    lineHeight: "1.12",
    letterSpacing: "-0.025em",
  },
  {
    tag: t.heading3,
    color: "var(--md-heading-3)",
    fontSize: "1.55em",
    fontWeight: "650",
    lineHeight: "1.2",
    letterSpacing: "-0.025em",
  },
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
