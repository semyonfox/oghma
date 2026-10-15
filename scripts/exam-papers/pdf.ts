import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { parseExamFilename } from "./metadata.ts";
import type { ExamPaperMetadata } from "./types.ts";

export interface ExtractedPage {
  number: number;
  text: string;
}

export interface ExtractedQuestion {
  number: string;
  text: string;
  marks?: number;
  pageStart: number;
  pageEnd: number;
  topics: string[];
}

export interface ExtractedPaper {
  metadata: ExamPaperMetadata;
  pages: ExtractedPage[];
  questions: ExtractedQuestion[];
  warnings: string[];
}

interface Line {
  page: number;
  text: string;
}

interface Heading {
  lineIndex: number;
  number: string;
  // whatever follows the question number on the heading line
  rest: string;
}

const execFileAsync = promisify(execFile);

const PDFTOTEXT_TIMEOUT_MS = 60_000;
const PDFTOTEXT_MAX_OUTPUT_BYTES = 32 * 1024 * 1024;

// below this many non-whitespace characters per page the PDF is probably scanned
const MIN_CHARS_PER_PAGE = 100;

// "Question 1", "QUESTION 1", "Q1.", "Q.1.", "Q. 1." and "Question1". dotAll because some
// PDFs leave stray carriage returns mid-line
const EXPLICIT_HEADING =
  /^\s*(?:Question|QUESTION|Q\s*\.?)\s*(?<number>\d{1,2})(?<rest>.*)$/s;
// the number must end there, so "Q3.b" and "Q4R" are not headings
const HEADING_BOUNDARY = /^(?:[.:)]|\s*[–—-])?(?:\s|$|[[(])/;
// "Question 1 is on the next page", "Question 1 in Section 1 is mandatory", "Question 2 etc."
const PROSE_AFTER_NUMBER = /^[\s.:)–—-]*[a-z]{2,}/;
const CROSS_REFERENCE = /\b(?:continued|continues|next page|instructions?)\b/i;

// "1. Text", "7) Text", "1   (a) Text" and "1  a) Text" near the left margin
const NUMERIC_HEADING =
  /^(?<indent>\s*)(?<number>[1-9]\d?)(?<rest>(?:[.)]\s+(?=\S)|\s+(?=\(?(?:[a-h]|i{1,3}|iv|v)\))).*)$/s;
const MAX_NUMERIC_INDENT = 8;

const MARKS = /(?<marks>\d{1,3})\s*marks?\b/i;
const MARKS_ONLY_LINE = /^\s*[[(]?\s*(?<marks>\d{1,3})\s*marks?\s*[\])]?\s*$/i;
const SUBPART_LABEL =
  /\(\s*(?:[a-z]|[ivx]{1,4})\s*\)|(?<![\w(])(?:[a-z]|[ivx]{1,4})\)/;

// page numbers, PTO and "continues on the next page" notes left between questions
const PAGE_FURNITURE =
  /^\s*(?:P\.?T\.?O\.?|Page\s+\d+(?:\s+of\s+\d+)?|.*\bon the next page\b.*)?\s*$/is;

export async function extractPaper(filePath: string): Promise<ExtractedPaper> {
  // fail on unsupported filenames before spawning anything
  const metadata = parseExamFilename(filePath);
  const output = await runPdftotext(filePath);

  return parsePdfText(output, metadata);
}

export function parsePdfText(
  output: string,
  metadata: ExamPaperMetadata,
): ExtractedPaper {
  const pageTexts = output.split("\f");
  // pdftotext ends every page with a form feed, including the last
  if (pageTexts.at(-1) === "") {
    pageTexts.pop();
  }

  const pages = pageTexts.map((text, index) => ({ number: index + 1, text }));
  const warnings = textWarnings(pages);
  const lines = pages.flatMap((page) =>
    page.text.split("\n").map((text) => ({ page: page.number, text })),
  );

  const headings = findHeadings(lines, warnings);
  const questions = headings.map((heading, index) =>
    buildQuestion(
      lines,
      heading,
      headings[index + 1]?.lineIndex ?? lines.length,
    ),
  );

  if (questions.length === 0) {
    warnings.push(
      "No question headings found; the paper needs manual splitting",
    );
  }

  if (
    /^\s*(?:appendix|appendices|formula(?:e)? sheet|statistical tables)\b/im.test(
      output.replace(/\f/g, "\n"),
    )
  )
    warnings.push(
      "Supplementary material may be attached to the final question; check the source pages",
    );
  return { metadata, pages, questions, warnings };
}

async function runPdftotext(filePath: string): Promise<string> {
  try {
    // absolute path so a filename starting with "-" can't be read as an option
    const { stdout } = await execFileAsync(
      "pdftotext",
      ["-layout", "-enc", "UTF-8", path.resolve(filePath), "-"],
      {
        encoding: "utf8",
        timeout: PDFTOTEXT_TIMEOUT_MS,
        maxBuffer: PDFTOTEXT_MAX_OUTPUT_BYTES,
        windowsHide: true,
      },
    );
    return stdout;
  } catch (error) {
    throw new Error(
      `pdftotext failed for ${filePath}: ${describeExecError(error)}`,
      {
        cause: error,
      },
    );
  }
}

function describeExecError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  if ("code" in error && error.code === "ENOENT") {
    return "pdftotext is not installed or not on PATH (it ships with poppler-utils)";
  }
  if ("code" in error && error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
    return `output exceeded ${PDFTOTEXT_MAX_OUTPUT_BYTES} bytes`;
  }
  if ("killed" in error && error.killed === true) {
    return `timed out after ${PDFTOTEXT_TIMEOUT_MS} ms`;
  }
  if (
    "stderr" in error &&
    typeof error.stderr === "string" &&
    error.stderr.trim() !== ""
  ) {
    return error.stderr.trim();
  }
  return error.message;
}

function textWarnings(pages: ExtractedPage[]): string[] {
  if (pages.length === 0) {
    return ["pdftotext returned no pages"];
  }

  const warnings: string[] = [];
  const charCounts = pages.map((page) => page.text.replace(/\s/g, "").length);
  const totalChars = charCounts.reduce((sum, count) => sum + count, 0);

  if (totalChars < MIN_CHARS_PER_PAGE * pages.length) {
    warnings.push(
      `Only ${totalChars} characters of text across ${pages.length} pages; the PDF may be scanned and OCR is not supported`,
    );
  }

  const emptyPages = pages
    .filter((_, index) => charCounts[index] === 0)
    .map((page) => page.number);
  if (emptyPages.length > 0 && emptyPages.length < pages.length) {
    warnings.push(
      `No text on page(s) ${emptyPages.join(", ")}; blank, or a scanned image that would need OCR`,
    );
  }

  return warnings;
}

function findHeadings(lines: Line[], warnings: string[]): Heading[] {
  const explicit = findExplicitHeadings(lines);
  const numeric = findNumericHeadings(lines);

  if (explicit.length === 0) {
    if (numeric.rivalLength > 0) {
      warnings.push(
        `Two numbered sequences look like question headings (${numeric.headings.length} and ${numeric.rivalLength} items); used the longer one, check the split`,
      );
    }
    return numeric.headings;
  }

  if (explicit.length === 1 && numeric.headings.length > 1) {
    warnings.push(
      `Only one "Question" heading found but ${numeric.headings.length} numbered headings also look plausible; check the split`,
    );
  }

  const numbers = explicit.map((heading) =>
    Number.parseInt(heading.number, 10),
  );
  const outOfOrder = numbers.some((number, index) => {
    const previous = numbers[index - 1];
    // a restart at 1 is a new section (e.g. section A and B both start at Q1)
    return previous !== undefined && number !== previous + 1 && number !== 1;
  });
  const hasRepeats = new Set(numbers).size !== numbers.length;

  if (outOfOrder) {
    warnings.push(
      `Question numbers are not sequential (${numbers.join(", ")}); check the split`,
    );
  } else if (hasRepeats) {
    warnings.push(
      `Question numbers repeat (${numbers.join(", ")}); the paper probably has sections with their own numbering`,
    );
  }

  return explicit;
}

function findExplicitHeadings(lines: Line[]): Heading[] {
  return lines.flatMap((line, lineIndex) => {
    const groups = EXPLICIT_HEADING.exec(line.text)?.groups;
    const number = groups?.number;
    const rest = groups?.rest ?? "";

    if (
      number === undefined ||
      !HEADING_BOUNDARY.test(rest) ||
      PROSE_AFTER_NUMBER.test(rest) ||
      CROSS_REFERENCE.test(rest)
    ) {
      return [];
    }

    return [{ lineIndex, number: String(Number.parseInt(number, 10)), rest }];
  });
}

// plain numbered lines are much noisier than "Question N" (numbered instructions, SQL
// task lists, MCQ options), so only a run counting up from 1 is trusted
function findNumericHeadings(lines: Line[]): {
  headings: Heading[];
  rivalLength: number;
} {
  const candidates = lines.flatMap((line, lineIndex) => {
    const groups = NUMERIC_HEADING.exec(line.text)?.groups;
    const number = groups?.number;

    if (
      number === undefined ||
      (groups?.indent ?? "").length > MAX_NUMERIC_INDENT
    ) {
      return [];
    }

    return [{ lineIndex, number, rest: groups?.rest ?? "" }];
  });

  // try every "1" as a start and greedily follow 2, 3, ... skipping anything else
  const runs = candidates.flatMap((start, startIndex) => {
    if (start.number !== "1") {
      return [];
    }

    const run = [start];
    for (const candidate of candidates.slice(startIndex + 1)) {
      if (Number.parseInt(candidate.number, 10) === run.length + 1) {
        run.push(candidate);
      }
    }
    return [run];
  });

  // a lone "1." is more likely a list item than a one-question paper
  const plausible = runs.filter((run) => run.length > 1);
  const best = plausible.reduce<Heading[]>(
    (longest, run) => (run.length > longest.length ? run : longest),
    [],
  );

  // a separate run at least half as long (e.g. numbered instructions before the questions)
  // makes the choice a guess. short lists like formula sheets don't count
  const rivalLength = plausible
    .filter(
      (run) =>
        run.length * 2 >= best.length &&
        !run.some((heading) => best.includes(heading)),
    )
    .reduce((longest, run) => Math.max(longest, run.length), 0);

  return { headings: best, rivalLength };
}

function buildQuestion(
  lines: Line[],
  heading: Heading,
  endIndex: number,
): ExtractedQuestion {
  const body = lines.slice(heading.lineIndex, endIndex);

  // keep layout, only drop blank lines and page furniture trailing into the next question
  let last = body.length - 1;
  while (last > 0 && PAGE_FURNITURE.test(body[last]?.text ?? "")) {
    last -= 1;
  }
  const kept = body.slice(0, last + 1);

  const firstPage = kept[0]?.page ?? 1;
  const marks = headingMarks(heading, kept);

  return {
    number: heading.number,
    text: kept.map((line) => line.text).join("\n"),
    ...(marks !== undefined ? { marks } : {}),
    pageStart: firstPage,
    pageEnd: kept.at(-1)?.page ?? firstPage,
    topics: [],
  };
}

// only marks stated on the heading itself count as the question total. "Q1. (a) [8 Marks]"
// is the mark for part (a), so a marks figure after a subpart label is ignored
function headingMarks(heading: Heading, body: Line[]): number | undefined {
  const marksMatch = MARKS.exec(heading.rest);

  if (marksMatch?.groups?.marks !== undefined) {
    const subpart = SUBPART_LABEL.exec(heading.rest);
    if (subpart === null || marksMatch.index < subpart.index) {
      return Number.parseInt(marksMatch.groups.marks, 10);
    }
    return undefined;
  }

  // a bare "Question 1" heading may put its total on the next line, e.g. "[20 Marks]"
  if (heading.rest.replace(/[\s.:)–—-]/g, "") === "") {
    const nextLine = body.slice(1).find((line) => line.text.trim() !== "");
    const marks = MARKS_ONLY_LINE.exec(nextLine?.text ?? "")?.groups?.marks;
    return marks !== undefined ? Number.parseInt(marks, 10) : undefined;
  }

  return undefined;
}
