"use client";

import { useEffect, useRef } from "react";
import {
  Annotation,
  EditorState,
  Compartment,
  RangeSetBuilder,
  StateField,
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
import katex from "katex";
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
  inlineHtml?: {
    tag: "mark" | "sub" | "sup" | "kbd";
    text: string;
  };
  horizontalRule?: boolean;
  image?: {
    alt: string;
    src: string;
    title?: string;
  };
}

export interface MarkdownTaskMarker {
  from: number;
  to: number;
  checkboxFrom: number;
  checkboxTo: number;
  checked: boolean;
}

export interface MathRenderRange {
  from: number;
  to: number;
  tex: string;
  displayMode: boolean;
}

export interface MarkdownCodeFenceRange {
  from: number;
  to: number;
  openFrom: number;
  openTo: number;
  closeFrom?: number;
  closeTo?: number;
  language?: string;
  title?: string;
}

export interface MarkdownTableRange {
  from: number;
  to: number;
  source: string;
  header: string[];
  rows: string[][];
  alignments: Array<"left" | "center" | "right" | undefined>;
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

class SafeInlineHtmlWidget extends WidgetType {
  constructor(
    private readonly tag: "mark" | "sub" | "sup" | "kbd",
    private readonly text: string,
  ) {
    super();
  }

  toDOM() {
    const element = document.createElement(this.tag);
    element.className = `cm-md-inline-html cm-md-inline-html-${this.tag}`;
    element.textContent = this.text;
    return element;
  }

  eq(other: SafeInlineHtmlWidget) {
    return this.tag === other.tag && this.text === other.text;
  }
}

class HorizontalRuleWidget extends WidgetType {
  toDOM() {
    const rule = document.createElement("span");
    rule.className = "cm-md-horizontal-rule";
    return rule;
  }
}

class MarkdownImageWidget extends WidgetType {
  constructor(
    private readonly alt: string,
    private readonly src: string,
    private readonly title?: string,
  ) {
    super();
  }

  toDOM() {
    const wrapper = document.createElement("span");
    wrapper.className = "cm-md-image";
    const safeSource = /^(https?:\/\/|\/|\.\.?\/)/i.test(this.src);
    if (!safeSource) {
      wrapper.textContent = this.alt || this.src;
      wrapper.classList.add("cm-md-image-invalid");
      return wrapper;
    }
    const image = document.createElement("img");
    image.src = this.src;
    image.alt = this.alt;
    image.loading = "lazy";
    if (this.title) image.title = this.title;
    wrapper.append(image);
    return wrapper;
  }

  eq(other: MarkdownImageWidget) {
    return (
      this.alt === other.alt &&
      this.src === other.src &&
      this.title === other.title
    );
  }
}

class MathRenderWidget extends WidgetType {
  constructor(
    private readonly tex: string,
    private readonly displayMode: boolean,
  ) {
    super();
  }

  toDOM() {
    const wrapper = document.createElement(this.displayMode ? "div" : "span");
    wrapper.className = this.displayMode ? "cm-math-display" : "cm-math-inline";

    try {
      katex.render(this.tex, wrapper, {
        displayMode: this.displayMode,
        throwOnError: false,
        strict: "ignore",
        trust: false,
      });
    } catch {
      wrapper.classList.add("cm-math-invalid");
      wrapper.textContent = this.displayMode ? `$$${this.tex}$$` : `$${this.tex}$`;
    }

    return wrapper;
  }

  eq(other: MathRenderWidget) {
    return this.tex === other.tex && this.displayMode === other.displayMode;
  }

  ignoreEvent() {
    return false;
  }
}

class CodeFenceHeaderWidget extends WidgetType {
  constructor(
    private readonly language?: string,
    private readonly title?: string,
  ) {
    super();
  }

  toDOM() {
    const header = document.createElement("span");
    header.className = "cm-code-cell-header";

    const language = document.createElement("span");
    language.className = "cm-code-cell-language";
    language.textContent = this.language
      ? CODE_BLOCK_LANGUAGES[this.language as keyof typeof CODE_BLOCK_LANGUAGES] ??
        this.language.toUpperCase()
      : "Code";
    header.append(language);

    if (this.title) {
      const title = document.createElement("span");
      title.className = "cm-code-cell-title";
      title.textContent = this.title;
      header.append(title);
    }

    return header;
  }

  eq(other: CodeFenceHeaderWidget) {
    return this.language === other.language && this.title === other.title;
  }
}

function plainMarkdownTableCell(value: string): string {
  return value
    .replace(/!\[([^\]]*)]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/(\*\*|__|~~|`)(.*?)\1/g, "$2")
    .replace(/(?<![\w_])_([^_]+)_(?![\w_])/g, "$1")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "$1")
    .replace(/\\\|/g, "|")
    .trim();
}

function plainHtmlTableCell(value: string): string {
  return value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .trim();
}

class MarkdownTableWidget extends WidgetType {
  constructor(private readonly tableRange: MarkdownTableRange) {
    super();
  }

  toDOM(view: EditorView) {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-md-table-scroll";
    wrapper.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.dispatch({
        selection: { anchor: this.tableRange.from },
        scrollIntoView: true,
      });
      view.focus();
    });
    const table = document.createElement("table");
    table.className = "cm-md-table";
    if (this.tableRange.header.length > 0) {
      const head = table.createTHead();
      const headerRow = head.insertRow();
      this.tableRange.header.forEach((value, index) => {
        const cell = document.createElement("th");
        cell.textContent = plainMarkdownTableCell(value);
        cell.style.textAlign = this.tableRange.alignments[index] ?? "left";
        headerRow.append(cell);
      });
    }

    const body = table.createTBody();
    const columnCount = Math.max(
      this.tableRange.header.length,
      ...this.tableRange.rows.map((row) => row.length),
    );
    for (const row of this.tableRange.rows) {
      const tableRow = body.insertRow();
      for (let index = 0; index < columnCount; index += 1) {
        const cell = tableRow.insertCell();
        cell.textContent = plainMarkdownTableCell(row[index] ?? "");
        cell.style.textAlign = this.tableRange.alignments[index] ?? "left";
      }
    }

    wrapper.append(table);
    return wrapper;
  }

  eq(other: MarkdownTableWidget) {
    return this.tableRange.source === other.tableRange.source;
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
    const closingMarker = match.index + match[0].length - markerLength;
    if (
      isEscaped(lineText, match.index) ||
      isEscaped(lineText, closingMarker)
    ) {
      continue;
    }
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

function isEscaped(text: string, index: number): boolean {
  let slashCount = 0;
  for (let pos = index - 1; pos >= 0 && text[pos] === "\\"; pos -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function codeFenceTitle(meta: string): string | undefined {
  const quoted = /(?:title|filename|file)=(['"])(.*?)\1/i.exec(meta);
  if (quoted?.[2]) return quoted[2].trim() || undefined;

  const bare = /(?:title|filename|file)=([^\s{}]+)/i.exec(meta);
  return bare?.[1]?.trim() || undefined;
}

export function markdownCodeFenceRanges(text: string): MarkdownCodeFenceRange[] {
  const ranges: MarkdownCodeFenceRange[] = [];
  const lines = text.split("\n");
  let offset = 0;
  let open:
    | {
        from: number;
        to: number;
        marker: string;
        language?: string;
        title?: string;
      }
    | undefined;

  for (const line of lines) {
    const trimmed = line.trimStart();
    const indent = line.length - trimmed.length;

    if (!open) {
      const match = /^(\`{3,}|~{3,})([^\s`]*)?(.*)$/.exec(trimmed);
      if (match) {
        open = {
          from: offset + indent,
          to: offset + line.length,
          marker: match[1][0],
          language: match[2]?.trim().toLowerCase() || undefined,
          title: codeFenceTitle(match[3] ?? ""),
        };
      }
    } else {
      const closePattern = open.marker === "`" ? /^\`{3,}\s*$/ : /^~{3,}\s*$/;
      if (closePattern.test(trimmed)) {
        ranges.push({
          from: open.from,
          to: offset + line.length,
          openFrom: open.from,
          openTo: open.to,
          closeFrom: offset + indent,
          closeTo: offset + line.length,
          language: open.language,
          title: open.title,
        });
        open = undefined;
      }
    }

    offset += line.length + 1;
  }

  if (open) {
    ranges.push({
      from: open.from,
      to: text.length,
      openFrom: open.from,
      openTo: open.to,
      language: open.language,
      title: open.title,
    });
  }

  return ranges;
}

export function markdownCodeFenceAt(
  ranges: MarkdownCodeFenceRange[],
  position: number,
): MarkdownCodeFenceRange | undefined {
  return ranges.find((range) => position >= range.from && position <= range.to);
}

function markdownTableCells(line: string): string[] {
  const trimmed = line.trim();
  const content = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;
  const withoutTrailingPipe = content.endsWith("|")
    ? content.slice(0, -1)
    : content;
  const cells: string[] = [];
  let cell = "";

  for (let index = 0; index < withoutTrailingPipe.length; index += 1) {
    const character = withoutTrailingPipe[index];
    if (character === "|" && withoutTrailingPipe[index - 1] !== "\\") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  return cells;
}

export function markdownTableRanges(text: string): MarkdownTableRange[] {
  const sourceLines = text.split("\n");
  const offsets: number[] = [];
  let offset = 0;
  for (const line of sourceLines) {
    offsets.push(offset);
    offset += line.length + 1;
  }

  const ranges: MarkdownTableRange[] = [];
  for (let index = 0; index < sourceLines.length - 1; index += 1) {
    if (!sourceLines[index].includes("|")) continue;
    const header = markdownTableCells(sourceLines[index]);
    const delimiters = markdownTableCells(sourceLines[index + 1]);
    if (
      header.length < 2 ||
      delimiters.length !== header.length ||
      !delimiters.every((cell) => /^:?-{3,}:?$/.test(cell))
    ) {
      continue;
    }

    const rows: string[][] = [];
    let lastLineIndex = index + 1;
    while (
      lastLineIndex + 1 < sourceLines.length &&
      sourceLines[lastLineIndex + 1].includes("|")
    ) {
      const row = markdownTableCells(sourceLines[lastLineIndex + 1]);
      if (row.length !== header.length) break;
      rows.push(row);
      lastLineIndex += 1;
    }

    const from = offsets[index];
    const to = offsets[lastLineIndex] + sourceLines[lastLineIndex].length;
    ranges.push({
      from,
      to,
      source: text.slice(from, to),
      header,
      rows,
      alignments: delimiters.map((cell) =>
        cell.startsWith(":") && cell.endsWith(":")
          ? "center"
          : cell.endsWith(":")
            ? "right"
            : cell.startsWith(":")
              ? "left"
              : undefined,
      ),
    });
    index = lastLineIndex;
  }
  return ranges;
}

export function htmlTableRanges(text: string): MarkdownTableRange[] {
  const ranges: MarkdownTableRange[] = [];
  for (const tableMatch of text.matchAll(/<table\b[^>]*>[\s\S]*?<\/table\s*>/gi)) {
    if (tableMatch.index == null) continue;
    const source = tableMatch[0];
    const parsedRows: Array<{ cells: string[]; header: boolean }> = [];

    for (const rowMatch of source.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)) {
      const cells: string[] = [];
      let header = false;
      for (const cellMatch of rowMatch[1].matchAll(
        /<(th|td)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi,
      )) {
        header ||= cellMatch[1].toLowerCase() === "th";
        cells.push(plainHtmlTableCell(cellMatch[2]));
      }
      if (cells.length > 0) parsedRows.push({ cells, header });
    }

    if (parsedRows.length === 0) continue;
    const firstRowIsHeader = parsedRows[0].header;
    const header = firstRowIsHeader ? parsedRows[0].cells : [];
    const rows = parsedRows.slice(firstRowIsHeader ? 1 : 0).map((row) => row.cells);
    const columnCount = Math.max(header.length, ...rows.map((row) => row.length));
    ranges.push({
      from: tableMatch.index,
      to: tableMatch.index + source.length,
      source,
      header,
      rows,
      alignments: Array.from({ length: columnCount }, () => undefined),
    });
  }
  return ranges;
}

function codeSpanRangesForLine(lineText: string): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = [];
  let start = -1;

  for (let index = 0; index < lineText.length; index += 1) {
    if (lineText[index] !== "`" || isEscaped(lineText, index)) continue;
    if (start === -1) {
      start = index;
    } else {
      ranges.push({ from: start, to: index + 1 });
      start = -1;
    }
  }

  return ranges;
}

function isInsideRanges(
  index: number,
  ranges: Array<{ from: number; to: number }>,
): boolean {
  return ranges.some((range) => index >= range.from && index < range.to);
}

export function inlineMathRangesForLine(
  lineText: string,
  lineFrom: number,
): MathRenderRange[] {
  const ranges: MathRenderRange[] = [];
  const codeSpans = codeSpanRangesForLine(lineText);

  for (let index = 0; index < lineText.length; index += 1) {
    if (
      lineText[index] !== "$" ||
      isEscaped(lineText, index) ||
      lineText[index - 1] === "$" ||
      lineText[index + 1] === "$" ||
      isInsideRanges(index, codeSpans)
    ) {
      continue;
    }

    for (let end = index + 1; end < lineText.length; end += 1) {
      if (
        lineText[end] !== "$" ||
        isEscaped(lineText, end) ||
        lineText[end - 1] === "$" ||
        lineText[end + 1] === "$" ||
        isInsideRanges(end, codeSpans)
      ) {
        continue;
      }

      const tex = lineText.slice(index + 1, end).trim();
      if (tex) {
        ranges.push({
          from: lineFrom + index,
          to: lineFrom + end + 1,
          tex,
          displayMode: false,
        });
      }
      index = end;
      break;
    }
  }

  return ranges;
}

function addMathDelimiterRanges(
  ranges: MarkdownSyntaxRange[],
  lineText: string,
  lineFrom: number,
) {
  for (const mathRange of inlineMathRangesForLine(lineText, lineFrom)) {
    ranges.push(
      { from: mathRange.from, to: mathRange.from + 1 },
      { from: mathRange.to - 1, to: mathRange.to },
    );
  }

  for (const match of lineText.matchAll(/\$\$([^$]+)\$\$/g)) {
    if (match.index == null || isEscaped(lineText, match.index)) continue;
    ranges.push(
      { from: lineFrom + match.index, to: lineFrom + match.index + 2 },
      {
        from: lineFrom + match.index + match[0].length - 2,
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

  if (/^((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/.test(text)) {
    return [
      {
        from: contentStart,
        to: lineFrom + lineText.length,
        horizontalRule: true,
      },
    ];
  }

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

  const blockquote = text.match(/^(?:>\s*)+/);
  if (blockquote) {
    ranges.push({ from: contentStart, to: contentStart + blockquote[0].length });
  }

  addInlinePairRanges(ranges, lineText, lineFrom, /\*\*\*([^*]+)\*\*\*/g, 3);
  addInlinePairRanges(ranges, lineText, lineFrom, /___([^_]+)___/g, 3);
  addInlinePairRanges(
    ranges,
    lineText,
    lineFrom,
    /(?<!\*)\*\*([^*]+)\*\*(?!\*)/g,
    2,
  );
  addInlinePairRanges(
    ranges,
    lineText,
    lineFrom,
    /(?<!_)__([^_]+)__(?!_)/g,
    2,
  );
  addInlinePairRanges(
    ranges,
    lineText,
    lineFrom,
    /(?<![\w_])_([^_\n]+)_(?![\w_])/g,
    1,
  );
  addInlinePairRanges(ranges, lineText, lineFrom, /(?<!\*)\*([^*\n]+)\*(?!\*)/g, 1);
  addInlinePairRanges(ranges, lineText, lineFrom, /~~([^~\n]+)~~/g, 2);
  addInlinePairRanges(ranges, lineText, lineFrom, /`([^`]+)`/g, 1);
  addMathDelimiterRanges(ranges, lineText, lineFrom);

  for (const match of lineText.matchAll(
    /!\[([^\]]*)]\(([^\s)]+)(?:\s+["']([^"']*)["'])?\)/g,
  )) {
    if (match.index == null || isEscaped(lineText, match.index)) continue;
    ranges.push({
      from: lineFrom + match.index,
      to: lineFrom + match.index + match[0].length,
      image: { alt: match[1], src: match[2], title: match[3] },
    });
  }

  for (const match of lineText.matchAll(/\[([^\]]+)]\(([^)]+)\)/g)) {
    if (match.index == null || !match[0]) continue;
    if (match.index > 0 && lineText[match.index - 1] === "!") continue;
    const textStart = match.index + 1;
    const textEnd = textStart + match[1].length;
    ranges.push(
      { from: lineFrom + match.index, to: lineFrom + textStart },
      { from: lineFrom + textEnd, to: lineFrom + match.index + match[0].length },
    );
  }

  for (const match of lineText.matchAll(
    /<(mark|sub|sup|kbd)\b[^>]*>([^<]*)<\/\1\s*>/gi,
  )) {
    if (match.index == null) continue;
    ranges.push({
      from: lineFrom + match.index,
      to: lineFrom + match.index + match[0].length,
      inlineHtml: {
        tag: match[1].toLowerCase() as "mark" | "sub" | "sup" | "kbd",
        text: match[2],
      },
    });
  }

  for (const match of lineText.matchAll(/\\[\\`*_[\]{}()#+\-.!>|]/g)) {
    if (match.index == null) continue;
    ranges.push({
      from: lineFrom + match.index,
      to: lineFrom + match.index + 1,
    });
  }

  return ranges;
}

function rangesOverlap(fromA: number, toA: number, fromB: number, toB: number): boolean {
  return fromA < toB && fromB < toA;
}

interface TableDecorationState {
  decorations: DecorationSet;
  tables: MarkdownTableRange[];
  codeFences: MarkdownCodeFenceRange[];
}

function parseTableDecorationState(documentText: string) {
  return {
    tables: [
      ...markdownTableRanges(documentText),
      ...htmlTableRanges(documentText),
    ].sort((a, b) => a.from - b.from),
    codeFences: markdownCodeFenceRanges(documentText),
  };
}

function buildTableDecorationSet(
  state: EditorState,
  tables: MarkdownTableRange[],
  codeFences: MarkdownCodeFenceRange[],
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const cursor = state.selection.main.head;

  for (const table of tables) {
    const active = cursor >= table.from && cursor <= table.to;
    const insideCodeFence = codeFences.some((fence) =>
      rangesOverlap(table.from, table.to, fence.from, fence.to),
    );
    if (active || insideCodeFence) continue;
    builder.add(
      table.from,
      table.to,
      Decoration.replace({
        widget: new MarkdownTableWidget(table),
        block: true,
      }),
    );
  }
  return builder.finish();
}

export const markdownTableDecorations = StateField.define<TableDecorationState>({
  create(state) {
    const parsed = parseTableDecorationState(state.doc.toString());
    return {
      ...parsed,
      decorations: buildTableDecorationSet(
        state,
        parsed.tables,
        parsed.codeFences,
      ),
    };
  },
  update(value, transaction) {
    const parsed = transaction.docChanged
      ? parseTableDecorationState(transaction.state.doc.toString())
      : value;
    if (!transaction.docChanged && !transaction.selection) return value;
    return {
      tables: parsed.tables,
      codeFences: parsed.codeFences,
      decorations: buildTableDecorationSet(
        transaction.state,
        parsed.tables,
        parsed.codeFences,
      ),
    };
  },
  provide: (field) =>
    EditorView.decorations.from(field, (value) => value.decorations),
});

function rangeTouchesLine(range: MathRenderRange, lineFrom: number, lineTo: number): boolean {
  return rangesOverlap(range.from, range.to, lineFrom, lineTo + 1);
}

function displayMathRangesForVisibleSpan(
  view: EditorView,
  from: number,
  to: number,
  activeLineFrom: number,
): MathRenderRange[] {
  const ranges: MathRenderRange[] = [];
  const doc = view.state.doc;
  let line = doc.lineAt(from);
  let inFence = false;
  let open:
    | {
        from: number;
        texStart: number;
        lineFrom: number;
      }
    | null = null;

  while (line.from <= to) {
    const trimmed = line.text.trimStart();
    if (trimmed.startsWith("```")) {
      inFence = !inFence;
    }

    if (!inFence || open) {
      let searchFrom = 0;
      while (searchFrom < line.text.length) {
        const delimiter = line.text.indexOf("$$", searchFrom);
        if (delimiter === -1) break;
        if (isEscaped(line.text, delimiter)) {
          searchFrom = delimiter + 2;
          continue;
        }

        const absoluteDelimiter = line.from + delimiter;
        if (!open) {
          open = {
            from: absoluteDelimiter,
            texStart: absoluteDelimiter + 2,
            lineFrom: line.from,
          };
          searchFrom = delimiter + 2;
          continue;
        }

        const texEnd = absoluteDelimiter;
        const closeTo = absoluteDelimiter + 2;
        const activeLine = view.state.doc.lineAt(view.state.selection.main.head);
        if (activeLine.from < open.lineFrom || activeLine.from > line.from) {
          const tex = doc.sliceString(open.texStart, texEnd).trim();
          if (tex) {
            ranges.push({
              from: open.from,
              to: closeTo,
              tex,
              displayMode: true,
            });
          }
        }
        open = null;
        searchFrom = delimiter + 2;
      }
    }

    if (line.to >= to || line.number >= doc.lines) break;
    line = doc.line(line.number + 1);
  }

  return ranges.filter((range) => !rangeTouchesLine(range, activeLineFrom, activeLineFrom));
}

type RenderDecoration = {
  from: number;
  to: number;
  decoration: Decoration;
  priority: number;
  point?: boolean;
};

function buildMarkdownRenderDecorations(
  view: EditorView,
  codeFences: MarkdownCodeFenceRange[],
): DecorationSet {
  const decorations: RenderDecoration[] = [];
  const activeLine = view.state.doc.lineAt(view.state.selection.main.head);
  const activeCodeFence = markdownCodeFenceAt(
    codeFences,
    view.state.selection.main.head,
  );
  for (const fence of codeFences) {
    const firstLine = view.state.doc.lineAt(fence.openFrom);
    const lastLine = view.state.doc.lineAt(fence.closeFrom ?? fence.to);
    let line = firstLine;

    while (line.number <= lastLine.number) {
      const classes = ["cm-code-cell-line"];
      if (line.number === firstLine.number) classes.push("cm-code-cell-first");
      if (line.number === lastLine.number) classes.push("cm-code-cell-last");
      decorations.push({
        from: line.from,
        to: line.from,
        decoration: Decoration.line({ class: classes.join(" ") }),
        priority: 0,
        point: true,
      });
      if (line.number === lastLine.number) break;
      line = view.state.doc.line(line.number + 1);
    }

    if (activeCodeFence !== fence) {
      decorations.push({
        from: fence.openFrom,
        to: fence.openTo,
        decoration: Decoration.replace({
          widget: new CodeFenceHeaderWidget(fence.language, fence.title),
        }),
        priority: 0,
      });
    }
  }

  for (const visibleRange of view.visibleRanges) {
    const fromLine = view.state.doc.lineAt(visibleRange.from);
    const toLine = view.state.doc.lineAt(visibleRange.to);
    const displayMathRanges = displayMathRangesForVisibleSpan(
      view,
      fromLine.from,
      toLine.to,
      activeLine.from,
    );

    for (const mathRange of displayMathRanges) {
      decorations.push({
        from: mathRange.from,
        to: mathRange.to,
        decoration: Decoration.replace({
          widget: new MathRenderWidget(mathRange.tex, true),
          block: true,
        }),
        priority: 0,
      });
    }

    let pos = visibleRange.from;
    let fenceIndex = codeFences.findIndex((fence) => fence.to >= fromLine.from);
    while (pos <= visibleRange.to) {
      const line = view.state.doc.lineAt(pos);
      const lineIsActive = line.from === activeLine.from;
      while (
        fenceIndex >= 0 &&
        fenceIndex < codeFences.length &&
        codeFences[fenceIndex].to < line.from
      ) {
        fenceIndex += 1;
      }
      const fence = fenceIndex >= 0 ? codeFences[fenceIndex] : undefined;
      const inFence = Boolean(
        fence && line.from >= fence.openFrom && line.from <= fence.to,
      );

      if (!lineIsActive && !inFence && /^\s*>/.test(line.text)) {
        decorations.push({
          from: line.from,
          to: line.from,
          decoration: Decoration.line({ class: "cm-md-blockquote-line" }),
          priority: 0,
          point: true,
        });
      }

      if (!lineIsActive && !inFence) {
        for (const mathRange of inlineMathRangesForLine(line.text, line.from)) {
          if (
            displayMathRanges.some((displayRange) =>
              rangesOverlap(mathRange.from, mathRange.to, displayRange.from, displayRange.to),
            )
          ) {
            continue;
          }
          decorations.push({
            from: mathRange.from,
            to: mathRange.to,
            decoration: Decoration.replace({
              widget: new MathRenderWidget(mathRange.tex, false),
            }),
            priority: 0,
          });
        }
      }

      const ranges = markdownSyntaxRangesForLine(
        line.text,
        line.from,
        lineIsActive,
      )
        .filter((range) => range.from < range.to)
        .sort((a, b) => a.from - b.from || a.to - b.to);

      for (const range of ranges) {
        decorations.push({
          from: range.from,
          to: range.to,
          decoration: Decoration.replace({
            widget:
              range.horizontalRule
                ? new HorizontalRuleWidget()
                : range.image
                  ? new MarkdownImageWidget(
                      range.image.alt,
                      range.image.src,
                      range.image.title,
                    )
                : range.inlineHtml
                ? new SafeInlineHtmlWidget(
                    range.inlineHtml.tag,
                    range.inlineHtml.text,
                  )
                : range.replaceWith !== undefined
                ? new MarkdownMarkerWidget(
                    range.replaceWith,
                    range.className,
                    range.taskMarker,
                  )
                : undefined,
          }),
          priority: 1,
        });
      }

      if (line.to >= visibleRange.to) break;
      pos = line.to + 1;
    }
  }

  const builder = new RangeSetBuilder<Decoration>();
  decorations.sort(
    (a, b) => a.from - b.from || a.priority - b.priority || a.to - b.to,
  );

  let lastTo = 0;
  for (const item of decorations) {
    if (item.point) {
      builder.add(item.from, item.to, item.decoration);
      continue;
    }
    if (item.from < lastTo || item.from >= item.to) continue;
    builder.add(item.from, item.to, item.decoration);
    lastTo = item.to;
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
    codeFences: MarkdownCodeFenceRange[];

    constructor(view: EditorView) {
      this.codeFences = markdownCodeFenceRanges(view.state.doc.toString());
      this.decorations = buildMarkdownRenderDecorations(view, this.codeFences);
    }

    update(update: ViewUpdate) {
      if (update.docChanged) {
        const documentText = update.state.doc.toString();
        this.codeFences = markdownCodeFenceRanges(documentText);
      }
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildMarkdownRenderDecorations(
          update.view,
          this.codeFences,
        );
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
        markdownTableDecorations,
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
