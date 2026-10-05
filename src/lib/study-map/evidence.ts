import { createHash } from "node:crypto";
import type { SourceAnchor, SourceDocument, SourcePassage } from "./types";

const MAX_SOURCE_CHARS = 320_000;
const MAX_PASSAGES = 250;
const MAX_QUOTE_CHARS = 8_000;

interface SourceInput {
  noteId: string;
  title: string;
  content: string | null;
  extractedText: string | null;
  isFile?: boolean;
  enforceLimit?: boolean;
}

interface SourceLine {
  start: number;
  end: number;
  text: string;
  line: number;
  page: number | null;
  pageMarker: boolean;
}

function assertSourceSize(
  source: Pick<SourceDocument, "text" | "title">,
): void {
  if (source.text.length > MAX_SOURCE_CHARS) {
    throw new Error(
      `"${source.title}" exceeds the 320,000-character study map limit. Split this material into smaller notes or files and try again.`,
    );
  }
}

export function sourceDocument(input: SourceInput): SourceDocument {
  const field = input.isFile ? "extracted_text" : "content";
  const text = (input.isFile ? input.extractedText : input.content) ?? "";
  if (input.enforceLimit !== false)
    assertSourceSize({ title: input.title, text });
  return {
    noteId: input.noteId,
    title: input.title,
    text,
    field,
    hash: createHash("sha256")
      .update(JSON.stringify([field, text]))
      .digest("hex"),
  };
}

function explicitPage(text: string): number | null {
  const match = text
    .trim()
    .match(
      /^(?:\[\s*page\s+([1-9]\d*)\s*\]|(?:-{2,}|={2,})\s*page\s+([1-9]\d*)\s*(?:-{2,}|={2,})|page\s+([1-9]\d*)(?:\s+of\s+[1-9]\d*)?)$/i,
    );
  if (!match) return null;
  const page = Number(match[1] ?? match[2] ?? match[3]);
  return Number.isSafeInteger(page) ? page : null;
}

function sourceLines(text: string): SourceLine[] {
  const lines: SourceLine[] = [];
  const pattern = /[^\r\n]*(?:\r\n|\r|\n|$)/g;
  let page: number | null = null;
  for (const match of text.matchAll(pattern)) {
    if (!match[0]) continue;
    const content = match[0].replace(/[\r\n]+$/, "");
    const marker = explicitPage(content);
    if (marker !== null) page = marker;
    lines.push({
      start: match.index,
      end: match.index + match[0].length,
      text: content,
      line: lines.length + 1,
      page,
      pageMarker: marker !== null,
    });
  }
  return lines;
}

function locationAt(
  lines: SourceLine[],
  offset: number,
): Pick<SourceAnchor, "line" | "page"> {
  let low = 0;
  let high = lines.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (lines[middle].start <= offset) low = middle + 1;
    else high = middle - 1;
  }
  const line = lines[high];
  return { line: line?.line ?? 1, page: line?.page ?? null };
}

function anchorAt(
  source: SourceDocument,
  start: number,
  end: number,
  lines: SourceLine[],
): SourceAnchor {
  return {
    noteId: source.noteId,
    field: source.field,
    hash: source.hash,
    start,
    end,
    quote: source.text.slice(start, end),
    ...locationAt(lines, start),
  };
}

export function splitSourcePassages(
  source: SourceDocument,
  maxChars = 1_600,
  /** merge neighbouring short blocks up to maxChars; slide text otherwise yields ~200-character passages */
  minChars = 0,
): SourcePassage[] {
  assertSourceSize(source);
  if (
    !Number.isInteger(maxChars) ||
    maxChars < 2 ||
    maxChars > MAX_QUOTE_CHARS
  ) {
    throw new Error(
      "Choose a passage size between 2 and 8,000 characters so each passage can hold a complete Unicode character.",
    );
  }
  const lines = sourceLines(source.text);
  const ranges: { start: number; end: number }[] = [];
  let blockStart = 0;
  const finishBlock = (end: number): void => {
    const block = source.text.slice(blockStart, end);
    const first = block.search(/\S/);
    if (first !== -1) {
      ranges.push({
        start: blockStart + first,
        end: blockStart + block.trimEnd().length,
      });
    }
    blockStart = end;
  };
  for (const line of lines) {
    if (!line.text.trim()) {
      finishBlock(line.start);
      blockStart = line.end;
    } else if (line.pageMarker || /^ {0,3}#{1,6}(?:\s|$)/.test(line.text)) {
      finishBlock(line.start);
    }
  }
  finishBlock(source.text.length);
  if (minChars > 0) {
    const merged: typeof ranges = [];
    for (const range of ranges) {
      const previous = merged.at(-1);
      if (
        previous &&
        previous.end - previous.start < minChars &&
        range.end - previous.start <= maxChars
      )
        previous.end = range.end;
      else merged.push({ ...range });
    }
    ranges.splice(0, ranges.length, ...merged);
  }

  const passages: SourcePassage[] = [];
  for (const range of ranges) {
    let start = range.start;
    while (start < range.end) {
      let end = Math.min(start + maxChars, range.end);
      if (end < range.end) {
        // prefer a word boundary without dropping whitespace or changing source offsets
        const chunk = source.text.slice(start, end);
        const whitespace = /\s+\S*$/u.exec(chunk);
        if (whitespace && whitespace.index >= maxChars / 2)
          end = start + whitespace.index + whitespace[0].search(/\S|$/u);
        const preceding = source.text.charCodeAt(end - 1);
        const following = source.text.charCodeAt(end);
        if (
          preceding >= 0xd800 &&
          preceding <= 0xdbff &&
          following >= 0xdc00 &&
          following <= 0xdfff
        )
          end -= 1;
      }
      const anchor = anchorAt(source, start, end, lines);
      passages.push({
        id: createHash("sha256")
          .update(JSON.stringify([source.noteId, source.hash, start, end]))
          .digest("hex"),
        text: anchor.quote,
        anchor,
      });
      if (passages.length > MAX_PASSAGES) {
        throw new Error(
          `"${source.title}" exceeds the 250-passage study map limit. Split this material into smaller notes or files and try again.`,
        );
      }
      start = end;
    }
  }
  return passages;
}

export function anchorFromQuote(
  source: SourceDocument,
  quote: string,
  occurrence = 0,
): SourceAnchor | null {
  if (
    !quote ||
    quote.length > MAX_QUOTE_CHARS ||
    !Number.isInteger(occurrence) ||
    occurrence < 0
  )
    return null;
  let start = -1;
  for (let index = 0; index <= occurrence; index += 1) {
    start = source.text.indexOf(quote, start + 1);
    if (start === -1) return null;
  }
  return anchorAt(
    source,
    start,
    start + quote.length,
    sourceLines(source.text),
  );
}

export function isCurrentAnchor(
  anchor: SourceAnchor,
  source: SourceDocument,
): boolean {
  if (
    anchor.noteId !== source.noteId ||
    anchor.field !== source.field ||
    anchor.hash !== source.hash ||
    !Number.isInteger(anchor.start) ||
    !Number.isInteger(anchor.end) ||
    anchor.start < 0 ||
    anchor.end <= anchor.start ||
    anchor.end > source.text.length ||
    !anchor.quote ||
    anchor.quote.length > MAX_QUOTE_CHARS ||
    source.text.slice(anchor.start, anchor.end) !== anchor.quote
  )
    return false;
  const location = locationAt(sourceLines(source.text), anchor.start);
  return anchor.line === location.line && anchor.page === location.page;
}

export function sourceExcerpt(source: SourceDocument, maxChars = 360): string {
  if (!Number.isInteger(maxChars) || maxChars < 0)
    throw new Error("Choose a nonnegative excerpt size in characters.");
  return source.text.slice(0, maxChars);
}
