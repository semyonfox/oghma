import { createHash, randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { extractPaper, type ExtractedPaper } from "./pdf.ts";

export interface Paper {
  id: string;
  filename: string;
  moduleCode: string;
  academicYear: string;
  sitting: string;
  component: string;
  period: string;
  title: string;
  url?: string;
  localPath?: string;
  sha256?: string;
  extractedPath?: string;
  archiveId?: string;
  language?: "ga";
}

export interface Catalogue {
  version: 1;
  papers: Paper[];
  scannedAt?: string;
  complete?: boolean;
}

export interface Rules {
  // collection name -> module patterns such as "CT213" or "CT3*"
  collections: Record<string, string[]>;
  // topic name -> keywords searched for in question text
  topics: Record<string, string[]>;
}

export interface Filters {
  module?: string;
  year?: string;
  sitting?: string;
  period?: string;
  search?: string;
  collection?: string;
  sort?: string;
}

const CATALOGUE_FILE = "catalogue.json";

// archive filenames are YEAR_YEAR_MODULE_COMPONENT_SITTING_PERIOD.pdf
const FILENAME_PATTERN =
  /^(?<startYear>\d{4})_(?<endYear>\d{4})_(?<moduleCode>[A-Z]{2,}\d+[A-Z0-9.]*)_(?<component>[A-Z0-9]+)_(?<sitting>\d+)_(?<period>\d+)\.pdf$/i;
const EXPECTED_FILENAME = "YEAR_YEAR_MODULE_COMPONENT_SITTING_PERIOD.pdf";

const MODULE_FILTER = /^[A-Z0-9.]+\*?$/i;
const YEAR_FILTER = /^\d{4}(?:[/_-]\d{4})?$/;
const CODE_FILTER = /^[A-Z0-9]+$/i;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const PDF_MAGIC = "%PDF-";

const SORTS = ["module", "year", "-year", "sitting", "title"] as const;
type Sort = (typeof SORTS)[number];

const PAPER_KEYS = new Set([
  "id",
  "filename",
  "moduleCode",
  "academicYear",
  "sitting",
  "component",
  "period",
  "title",
  "url",
  "localPath",
  "sha256",
  "extractedPath",
  "archiveId",
  "language",
]);
const DERIVED_KEYS = [
  "moduleCode",
  "academicYear",
  "sitting",
  "component",
  "period",
] as const;
const CATALOGUE_KEYS = new Set(["version", "papers", "scannedAt", "complete"]);
const RULES_KEYS = new Set(["collections", "topics"]);

const EXTRACTION_NOTE =
  "Text comes from the PDF text layer via pdftotext; no OCR was run. Question boundaries, marks and topics are heuristic matches on that text, and equations, tables and diagrams may be garbled or missing. Check against the source PDF.";

export function paperFromFilename(filename: string, title = ""): Paper {
  const groups = FILENAME_PATTERN.exec(filename)?.groups;
  const startYear = groups?.startYear;
  const endYear = groups?.endYear;
  const moduleCode = groups?.moduleCode?.toUpperCase();
  const component = groups?.component?.toUpperCase();
  const sitting = groups?.sitting;
  const period = groups?.period;

  if (
    startYear === undefined ||
    endYear === undefined ||
    moduleCode === undefined ||
    component === undefined ||
    sitting === undefined ||
    period === undefined
  ) {
    throw new Error(
      `Unsupported exam-paper filename: ${filename} (expected ${EXPECTED_FILENAME})`,
    );
  }

  const canonical = `${startYear}_${endYear}_${moduleCode}_${component}_${sitting}_${period}.pdf`;
  return {
    id: canonical.toLowerCase(),
    filename: canonical,
    moduleCode,
    academicYear: `${startYear}/${endYear}`,
    sitting,
    component,
    period,
    title,
  };
}

export function validatePaper(value: unknown): Paper {
  if (!isRecord(value)) {
    throw new Error("paper must be an object");
  }
  rejectUnknownKeys(value, PAPER_KEYS, "paper");

  const filename = requireString(value, "filename", "paper");
  const paper = paperFromFilename(
    filename,
    requireString(value, "title", `paper ${filename}`),
  );

  if (paper.filename !== filename) {
    throw new Error(
      `paper ${filename}: filename must be written as ${paper.filename}`,
    );
  }
  const archiveId = optionalString(value, "archiveId", `paper ${filename}`);
  if (archiveId !== undefined) {
    if (!/^\d+$/.test(archiveId)) throw new Error("Invalid archive paper ID");
    paper.archiveId = archiveId;
    paper.id += "@" + archiveId;
  }
  if (value.language !== undefined) {
    if (value.language !== "ga") throw new Error("Invalid paper language");
    paper.language = "ga";
    paper.id += "@ga";
  }
  if (value.id !== paper.id)
    throw new Error(`paper ${filename}: invalid identity`);
  // check filename metadata before using it for filtering or paths
  for (const key of DERIVED_KEYS) {
    if (value[key] !== paper[key]) {
      throw new Error(
        `paper ${filename}: ${key} must be ${JSON.stringify(paper[key])}`,
      );
    }
  }

  const url = optionalString(value, "url", `paper ${filename}`);
  if (url !== undefined) {
    checkUrl(url, filename);
    paper.url = url;
  }

  const localPath = optionalString(value, "localPath", `paper ${filename}`);
  if (localPath !== undefined) {
    checkRelative(localPath, `paper ${filename}: localPath`);
    paper.localPath = localPath;
  }

  const sha256 = optionalString(value, "sha256", `paper ${filename}`);
  if (sha256 !== undefined) {
    if (!SHA256_HEX.test(sha256)) {
      throw new Error(
        `paper ${filename}: sha256 must be 64 lowercase hex characters`,
      );
    }
    paper.sha256 = sha256;
  }

  const extractedPath = optionalString(
    value,
    "extractedPath",
    `paper ${filename}`,
  );
  if (extractedPath !== undefined) {
    checkRelative(extractedPath, `paper ${filename}: extractedPath`);
    paper.extractedPath = extractedPath;
  }

  return paper;
}

export async function readCatalogue(root: string): Promise<Catalogue> {
  const file = path.join(root, CATALOGUE_FILE);
  const text = await readOptionalText(file);
  if (text === undefined) {
    return { version: 1, papers: [] };
  }
  return validateCatalogue(parseJson(text, file), file);
}

export async function saveCatalogue(
  root: string,
  catalogue: Catalogue,
): Promise<void> {
  const file = path.join(root, CATALOGUE_FILE);
  // round trip so nothing is written that readCatalogue would later refuse
  const checked = validateCatalogue(
    JSON.parse(JSON.stringify(catalogue)),
    file,
  );
  await writeAtomic(file, `${JSON.stringify(checked, null, 2)}\n`);
}

// explicitly requested rules must exist
export async function readRules(filename?: string): Promise<Rules> {
  if (filename === undefined) {
    return { collections: {}, topics: {} };
  }
  const text = await readOptionalText(filename);
  if (text === undefined) throw new Error(`Rules file not found: ${filename}`);
  return validateRules(parseJson(text, filename), filename);
}

export function filterPapers(
  papers: Paper[],
  filters: Filters,
  rules: Rules,
): Paper[] {
  // validate every filter up front so a typo fails even when nothing would match
  const modules =
    filters.module === undefined
      ? undefined
      : parseList(filters.module, "module", MODULE_FILTER, "CT213 or CT3*").map(
          (item) => item.toUpperCase(),
        );
  const years =
    filters.year === undefined
      ? undefined
      : parseList(
          filters.year,
          "year",
          YEAR_FILTER,
          "2023/2024 or 2023-2024",
        ).map((item) =>
          item.length === 4
            ? `${item}/${Number(item) + 1}`
            : item.replace(/[_-]/, "/"),
        );
  const sittings =
    filters.sitting === undefined
      ? undefined
      : parseList(filters.sitting, "sitting", CODE_FILTER, "1 or 1,2");
  const periods =
    filters.period === undefined
      ? undefined
      : parseList(filters.period, "period", CODE_FILTER, "2 or 2,5");

  let collection: string[] | undefined;
  if (filters.collection !== undefined) {
    const name = filters.collection.trim();
    const patterns = Object.hasOwn(rules.collections, name)
      ? rules.collections[name]
      : undefined;
    if (patterns === undefined) {
      const known = Object.keys(rules.collections);
      throw new Error(
        `Unknown collection "${name}"; ${known.length > 0 ? `known: ${known.join(", ")}` : "no collections are configured"}`,
      );
    }
    collection = patterns.map((pattern) => pattern.toUpperCase());
  }

  let search: string | undefined;
  if (filters.search !== undefined) {
    search = filters.search.trim().toLowerCase();
    if (search === "") {
      throw new Error("search filter is empty");
    }
  }

  let sort: Sort | undefined = "module";
  if (filters.sort !== undefined) {
    const requested = filters.sort.trim();
    sort = SORTS.find((option) => option === requested);
    if (sort === undefined) {
      throw new Error(
        `Unknown sort "${requested}"; use one of ${SORTS.join(", ")}`,
      );
    }
  }

  const selected = papers.filter(
    (paper) =>
      (modules === undefined ||
        modules.some((pattern) => moduleMatches(pattern, paper.moduleCode))) &&
      (collection === undefined ||
        collection.some((pattern) =>
          moduleMatches(pattern, paper.moduleCode),
        )) &&
      (years === undefined || years.includes(paper.academicYear)) &&
      (sittings === undefined || sittings.includes(paper.sitting)) &&
      (periods === undefined || periods.includes(paper.period)) &&
      (search === undefined ||
        paper.title.toLowerCase().includes(search) ||
        paper.filename.toLowerCase().includes(search)),
  );

  return sort === undefined ? selected : [...selected].sort(comparator(sort));
}

export function safePath(root: string, relative: string): string {
  checkRelative(relative, "path");
  const base = path.resolve(root);
  const resolved = path.resolve(base, ...relative.split("/"));
  const fromBase = path.relative(base, resolved);

  if (
    fromBase === "" ||
    fromBase.startsWith("..") ||
    path.isAbsolute(fromBase)
  ) {
    throw new Error(`path ${relative} escapes ${base}`);
  }
  return resolved;
}

export function pdfPath(paper: Paper): string {
  // rebuilt from the filename so stray characters in other fields can't reach the path
  const canonical = paperFromFilename(paper.filename);
  return path.posix.join(
    "papers",
    canonical.moduleCode,
    yearDirectory(canonical),
    ...(paper.archiveId
      ? [paper.archiveId + (paper.language === "ga" ? "-ga" : "")]
      : []),
    canonical.filename,
  );
}

export function validPdf(bytes: Uint8Array): boolean {
  return (
    bytes.length >= PDF_MAGIC.length &&
    [...PDF_MAGIC].every((char, index) => bytes[index] === char.charCodeAt(0))
  );
}

// only sets localPath and sha256 once the bytes are safely on disk
export async function storePdf(
  root: string,
  paper: Paper,
  bytes: Uint8Array,
): Promise<void> {
  if (!validPdf(bytes)) {
    throw new Error(`${paper.filename} is not a PDF (no ${PDF_MAGIC} header)`);
  }

  const relative = pdfPath(paper);
  const target = safePath(root, relative);
  const sha256 = sha256Hex(bytes);
  const stats = await optionalLstat(target);

  if (stats === undefined) {
    await writeAtomic(target, bytes);
  } else {
    if (!stats.isFile()) {
      throw new Error(
        `${relative} exists but is not a regular file; refusing to touch it`,
      );
    }
    if (sha256Hex(await readFile(target)) !== sha256) {
      throw new Error(
        `${relative} already exists with different contents; refusing to overwrite`,
      );
    }
  }

  paper.localPath = relative;
  paper.sha256 = sha256;
}

export async function verifyLocal(
  root: string,
  paper: Paper,
): Promise<boolean> {
  if (paper.localPath === undefined || paper.sha256 === undefined) {
    return false;
  }
  const file = safePath(root, paper.localPath);
  const stats = await optionalLstat(file);
  if (stats === undefined || !stats.isFile()) {
    return false;
  }
  const bytes = await readFile(file);
  return validPdf(bytes) && sha256Hex(bytes) === paper.sha256;
}

export async function importPapers(
  root: string,
  directory: string,
  catalogue: Catalogue,
): Promise<{ imported: number; skipped: string[] }> {
  const source = path.resolve(directory);
  const library = path.resolve(root);
  const byId = new Map(catalogue.papers.map((paper) => [paper.id, paper]));
  const skipped: string[] = [];
  let imported = 0;

  for await (const file of walk(source, library, skipped)) {
    const label = path.relative(source, file) || path.basename(file);

    if (path.extname(file).toLowerCase() !== ".pdf") {
      skipped.push(`${label}: not a PDF`);
      continue;
    }

    let candidate: Paper;
    try {
      candidate = paperFromFilename(path.basename(file));
    } catch {
      skipped.push(
        `${label}: unrecognised filename (expected ${EXPECTED_FILENAME})`,
      );
      continue;
    }

    const bytes = await readFile(file);
    if (!validPdf(bytes)) {
      skipped.push(`${label}: no ${PDF_MAGIC} header`);
      continue;
    }

    const matchingNames = catalogue.papers.filter(
      (paper) => paper.filename === candidate.filename,
    );
    const existing =
      byId.get(candidate.id) ??
      (matchingNames.length === 1 ? matchingNames[0] : undefined);
    if (
      existing?.sha256 === sha256Hex(bytes) &&
      (await verifyLocal(root, existing))
    ) {
      skipped.push(`${label}: already in the library`);
      continue;
    }

    const paper = existing ?? candidate;
    try {
      await storePdf(root, paper, bytes);
    } catch (error) {
      skipped.push(`${label}: ${errorMessage(error)}`);
      continue;
    }

    if (existing === undefined) {
      catalogue.papers.push(paper);
      byId.set(paper.id, paper);
    }
    imported += 1;
  }

  return { imported, skipped };
}

export async function extractSelected(
  root: string,
  papers: Paper[],
  rules: Rules,
): Promise<{ extracted: number; warnings: Record<string, string[]> }> {
  const topics = Object.entries(rules.topics).map(([name, keywords]) => ({
    name,
    patterns: keywords.map(keywordPattern),
  }));
  const warnings: Record<string, string[]> = {};
  let extracted = 0;

  for (const paper of papers) {
    const localPath = paper.localPath;
    if (localPath === undefined || !(await verifyLocal(root, paper))) {
      warnings[paper.id] = [
        "No verified local PDF (missing or hash mismatch); import or download it first",
      ];
      continue;
    }

    let result: ExtractedPaper;
    try {
      result = await extractPaper(safePath(root, localPath));
    } catch (error) {
      // earlier output for this paper, if any, is left as it was
      warnings[paper.id] = [
        `Extraction failed, previous results kept: ${errorMessage(error)}`,
      ];
      continue;
    }

    const questions = result.questions.map((question) => ({
      number: question.number,
      pageStart: question.pageStart,
      pageEnd: question.pageEnd,
      ...(question.marks !== undefined
        ? { marksOnHeading: question.marks }
        : {}),
      topics: [
        ...new Set([
          ...question.topics,
          ...topics
            .filter((topic) =>
              topic.patterns.some((pattern) => pattern.test(question.text)),
            )
            .map((topic) => topic.name),
        ]),
      ],
      text: question.text,
    }));

    const output = {
      // keep catalogue titles and source links alongside the filename metadata
      paper: {
        id: paper.id,
        filename: paper.filename,
        moduleCode: paper.moduleCode,
        academicYear: paper.academicYear,
        component: paper.component,
        sitting: paper.sitting,
        period: paper.period,
        title: paper.title,
        ...(paper.url !== undefined ? { url: stripQuery(paper.url) } : {}),
        sourcePdf: localPath,
        sha256: paper.sha256,
      },
      extraction: {
        tool: "pdftotext -layout",
        ocr: false,
        extractedAt: new Date().toISOString(),
        note: EXTRACTION_NOTE,
      },
      warnings: result.warnings,
      pages: result.pages,
      questions,
    };

    const base = extractedBase(paper);
    await writeAtomic(
      safePath(root, `${base}.json`),
      `${JSON.stringify(output, null, 2)}\n`,
    );
    await writeAtomic(
      safePath(root, `${base}.txt`),
      plainText(output.paper, result),
    );
    await writeAtomic(
      safePath(root, `${base}.md`),
      markdown(output.paper, result, questions),
    );

    paper.extractedPath = `${base}.json`;
    extracted += 1;
    if (result.warnings.length > 0) {
      warnings[paper.id] = result.warnings;
    }
  }

  return { extracted, warnings };
}

interface OutputPaper {
  filename: string;
  moduleCode: string;
  academicYear: string;
  component: string;
  sitting: string;
  period: string;
  title: string;
  sourcePdf: string;
}

interface OutputQuestion {
  number: string;
  pageStart: number;
  pageEnd: number;
  marksOnHeading?: number;
  topics: string[];
  text: string;
}

function plainText(paper: OutputPaper, result: ExtractedPaper): string {
  const header = [
    `${paper.moduleCode} ${paper.academicYear} component ${paper.component} sitting ${paper.sitting} period ${paper.period}`,
    ...(paper.title !== "" ? [paper.title] : []),
    `source: ${paper.sourcePdf}`,
    EXTRACTION_NOTE,
  ];
  const pages = result.pages.map(
    (page) => `--- page ${page.number} ---\n${page.text}`,
  );
  return `${[...header, "", ...pages].join("\n")}\n`;
}

function sourceLink(sourcePdf: string): string {
  return path.posix.relative(
    path.posix.dirname(sourcePdf.replace(/^papers\//, "extracted/")),
    sourcePdf,
  );
}

function markdown(
  paper: OutputPaper,
  result: ExtractedPaper,
  questions: OutputQuestion[],
): string {
  const lines = [
    `# ${paper.moduleCode} ${paper.academicYear}`,
    "",
    ...(paper.title !== "" ? [paper.title, ""] : []),
    `- Component ${paper.component}, sitting ${paper.sitting}, period ${paper.period}`,
    `- [Source PDF](${sourceLink(paper.sourcePdf)})`,
    `- ${result.pages.length} pages, ${questions.length} question headings found`,
    "",
    `> ${EXTRACTION_NOTE}`,
    "",
  ];

  if (result.warnings.length > 0) {
    lines.push(
      "## Warnings",
      "",
      ...result.warnings.map((warning) => `- ${warning}`),
      "",
    );
  }

  for (const question of questions) {
    const pages =
      question.pageStart === question.pageEnd
        ? `page ${question.pageStart}`
        : `pages ${question.pageStart}-${question.pageEnd}`;
    const details = [
      pages,
      ...(question.marksOnHeading !== undefined
        ? [`${question.marksOnHeading} marks on heading`]
        : []),
      ...(question.topics.length > 0
        ? [`topics: ${question.topics.join(", ")}`]
        : []),
    ];
    const fence = codeFence(question.text);
    lines.push(
      `## Question ${question.number}`,
      "",
      details.join(" · "),
      "",
      `[Source page ${question.pageStart}](${sourceLink(paper.sourcePdf)}#page=${question.pageStart})`,
      "",
      `${fence}text`,
      question.text,
      fence,
      "",
    );
  }

  return lines.join("\n");
}

// longer than any backtick run in the text so layout text can't close the block early
function codeFence(text: string): string {
  const longest = Math.max(
    0,
    ...[...text.matchAll(/`+/g)].map((match) => match[0].length),
  );
  return "`".repeat(Math.max(3, longest + 1));
}

function keywordPattern(keyword: string): RegExp {
  const escaped = keyword
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    // layout text can wrap or pad a phrase
    .replace(/\s+/g, "\\s+");
  const start = /^\w/.test(keyword.trim()) ? "\\b" : "";
  const end = /\w$/.test(keyword.trim()) ? "\\b" : "";
  return new RegExp(`${start}${escaped}${end}`, "i");
}

function comparator(sort: Sort): (a: Paper, b: Paper) => number {
  const text = (a: string, b: string): number =>
    a.localeCompare(b, "en", { numeric: true });
  const fallback = (a: Paper, b: Paper): number => text(a.filename, b.filename);

  switch (sort) {
    case "module":
      return (a, b) =>
        text(a.moduleCode, b.moduleCode) ||
        text(a.academicYear, b.academicYear) ||
        fallback(a, b);
    case "year":
      return (a, b) =>
        text(a.academicYear, b.academicYear) ||
        text(a.moduleCode, b.moduleCode) ||
        fallback(a, b);
    case "-year":
      return (a, b) =>
        text(b.academicYear, a.academicYear) ||
        text(a.moduleCode, b.moduleCode) ||
        fallback(a, b);
    case "sitting":
      return (a, b) => text(a.sitting, b.sitting) || fallback(a, b);
    case "title":
      return (a, b) => text(a.title, b.title) || fallback(a, b);
  }
}

function moduleMatches(pattern: string, moduleCode: string): boolean {
  return pattern.endsWith("*")
    ? moduleCode.startsWith(pattern.slice(0, -1))
    : moduleCode === pattern;
}

function parseList(
  value: string,
  name: string,
  pattern: RegExp,
  example: string,
): string[] {
  const items = value.split(",").map((item) => item.trim());
  const bad = items.find((item) => !pattern.test(item));
  if (bad !== undefined) {
    throw new Error(
      `Invalid ${name} filter "${bad || value}"; expected e.g. ${example}`,
    );
  }
  return items;
}

function validateCatalogue(value: unknown, source: string): Catalogue {
  if (!isRecord(value)) {
    throw new Error(`${source}: catalogue must be an object`);
  }
  rejectUnknownKeys(value, CATALOGUE_KEYS, source);
  if (value.version !== 1) {
    throw new Error(
      `${source}: unsupported catalogue version ${JSON.stringify(value.version)}`,
    );
  }
  if (!Array.isArray(value.papers)) {
    throw new Error(`${source}: papers must be an array`);
  }

  const seen = new Set<string>();
  const papers = value.papers.map((item: unknown, index) => {
    let paper: Paper;
    try {
      paper = validatePaper(item);
    } catch (error) {
      throw new Error(`${source}: papers[${index}]: ${errorMessage(error)}`, {
        cause: error,
      });
    }
    if (seen.has(paper.id)) {
      throw new Error(`${source}: duplicate paper ${paper.id}`);
    }
    seen.add(paper.id);
    return paper;
  });

  const catalogue: Catalogue = { version: 1, papers };
  const scannedAt = optionalString(value, "scannedAt", source);
  if (scannedAt !== undefined) {
    if (Number.isNaN(Date.parse(scannedAt))) {
      throw new Error(`${source}: scannedAt must be a date`);
    }
    catalogue.scannedAt = scannedAt;
  }
  if (value.complete !== undefined) {
    if (typeof value.complete !== "boolean") {
      throw new Error(`${source}: complete must be true or false`);
    }
    catalogue.complete = value.complete;
  }
  return catalogue;
}

function validateRules(value: unknown, source: string): Rules {
  if (!isRecord(value)) {
    throw new Error(
      `${source}: rules must be an object like {"collections": {}, "topics": {}}`,
    );
  }
  rejectUnknownKeys(value, RULES_KEYS, source);
  return {
    collections: stringLists(
      value.collections,
      `${source}: collections`,
      (item) =>
        MODULE_FILTER.test(item)
          ? undefined
          : "must be a module code or prefix like CT213 or CT3*",
    ),
    topics: stringLists(value.topics, `${source}: topics`, () => undefined),
  };
}

function stringLists(
  value: unknown,
  context: string,
  problem: (item: string) => string | undefined,
): Record<string, string[]> {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object of name -> list of strings`);
  }
  // fromEntries defines own properties, so a "__proto__" name can't touch the prototype
  return Object.fromEntries(
    Object.entries(value).map(([name, items]) => {
      if (name.trim() === "") {
        throw new Error(`${context}: names must not be empty`);
      }
      if (!Array.isArray(items)) {
        throw new Error(`${context}.${name} must be a list of strings`);
      }
      const strings = items.map((item: unknown) => {
        if (typeof item !== "string" || item.trim() === "") {
          throw new Error(
            `${context}.${name} must contain only non-empty strings`,
          );
        }
        const reason = problem(item.trim());
        if (reason !== undefined) {
          throw new Error(`${context}.${name}: "${item}" ${reason}`);
        }
        return item.trim();
      });
      return [name, strings];
    }),
  );
}

function checkUrl(value: string, filename: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`paper ${filename}: url is not a valid URL`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`paper ${filename}: url must be http or https`);
  }
  if (url.username !== "" || url.password !== "") {
    throw new Error(`paper ${filename}: url must not contain credentials`);
  }
}

// query strings can carry session tokens, so extracted output only keeps the address
function stripQuery(value: string): string {
  const url = new URL(value);
  url.search = "";
  url.hash = "";
  return url.toString();
}

// catalogue paths are relative, use "/" and never step outside the library root
function checkRelative(value: string, context: string): void {
  const segments = value.split("/");
  if (
    value === "" ||
    value.includes("\0") ||
    value.includes("\\") ||
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    segments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    )
  ) {
    throw new Error(
      `${context} must be a plain relative path, got ${JSON.stringify(value)}`,
    );
  }
}

function yearDirectory(paper: Paper): string {
  return paper.academicYear.replace("/", "-");
}

function extractedBase(paper: Paper): string {
  const canonical = paperFromFilename(paper.filename);
  return path.posix.join(
    "extracted",
    canonical.moduleCode,
    yearDirectory(canonical),
    ...(paper.archiveId
      ? [paper.archiveId + (paper.language === "ga" ? "-ga" : "")]
      : []),
    canonical.filename.slice(0, -".pdf".length),
  );
}

async function* walk(
  directory: string,
  library: string,
  skipped: string[],
  base = directory,
): AsyncGenerator<string> {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));

  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    const label = path.relative(base, full);

    if (entry.isSymbolicLink()) {
      skipped.push(`${label}: symlink, not followed`);
    } else if (entry.isDirectory()) {
      // importing a folder that contains the library would re-read its own stored copies
      if (full === library) {
        skipped.push(`${label}: library root, not imported`);
      } else {
        yield* walk(full, library, skipped, base);
      }
    } else if (entry.isFile()) {
      yield full;
    } else {
      skipped.push(`${label}: not a regular file`);
    }
  }
}

// temp file in the same directory then rename, so readers see the old file or the new one
async function writeAtomic(
  target: string,
  data: string | Uint8Array,
): Promise<void> {
  const directory = path.dirname(target);
  await mkdir(directory, { recursive: true });
  const temp = path.join(
    directory,
    `.${path.basename(target)}.${randomUUID()}.tmp`,
  );

  try {
    const handle = await open(temp, "wx", 0o600);
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, target);
  } catch (error) {
    await unlink(temp).catch(() => undefined);
    throw error;
  }
}

async function readOptionalText(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (isErrno(error, "ENOENT")) {
      return undefined;
    }
    throw error;
  }
}

async function optionalLstat(file: string): Promise<Stats | undefined> {
  try {
    return await lstat(file);
  } catch (error) {
    if (isErrno(error, "ENOENT") || isErrno(error, "ENOTDIR")) {
      return undefined;
    }
    throw error;
  }
}

function parseJson(text: string, source: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${source} is not valid JSON: ${errorMessage(error)}`, {
      cause: error,
    });
  }
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
  context: string,
): void {
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown !== undefined) {
    throw new Error(`${context}: unknown field "${unknown}"`);
  }
}

function requireString(
  value: Record<string, unknown>,
  key: string,
  context: string,
): string {
  const field = value[key];
  if (typeof field !== "string") {
    throw new Error(`${context}: ${key} must be a string`);
  }
  return field;
}

function optionalString(
  value: Record<string, unknown>,
  key: string,
  context: string,
): string | undefined {
  return value[key] === undefined
    ? undefined
    : requireString(value, key, context);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface QuestionResult {
  paperId: string;
  moduleCode: string;
  academicYear: string;
  sitting: string;
  number: string;
  pageStart: number;
  pageEnd: number;
  text: string;
  topics: string[];
  sourcePdf: string;
  marksOnHeading?: number;
}

export async function readQuestions(
  root: string,
  papers: Paper[],
  text?: string,
  topic?: string,
): Promise<QuestionResult[]> {
  const results: QuestionResult[] = [];
  for (const paper of papers) {
    if (!paper.extractedPath || !paper.localPath) continue;
    const filename = safePath(root, paper.extractedPath);
    const data = parseJson(await readFile(filename, "utf8"), filename);
    if (!isRecord(data) || !Array.isArray(data.questions))
      throw new Error(`Invalid question export: ${filename}`);
    for (const q of data.questions) {
      if (
        !isRecord(q) ||
        typeof q.number !== "string" ||
        typeof q.text !== "string" ||
        typeof q.pageStart !== "number" ||
        !Number.isInteger(q.pageStart) ||
        q.pageStart < 1 ||
        typeof q.pageEnd !== "number" ||
        !Number.isInteger(q.pageEnd) ||
        q.pageEnd < q.pageStart ||
        !Array.isArray(q.topics) ||
        !q.topics.every((t): t is string => typeof t === "string") ||
        (q.marksOnHeading !== undefined &&
          (typeof q.marksOnHeading !== "number" ||
            !Number.isFinite(q.marksOnHeading)))
      )
        throw new Error(`Invalid question in ${filename}`);
      if (text && !q.text.toLowerCase().includes(text.toLowerCase())) continue;
      if (
        topic &&
        !q.topics.some((t) => t.toLowerCase() === topic.toLowerCase())
      )
        continue;
      results.push({
        paperId: paper.id,
        moduleCode: paper.moduleCode,
        academicYear: paper.academicYear,
        sitting: paper.sitting,
        number: q.number,
        pageStart: q.pageStart,
        pageEnd: q.pageEnd,
        text: q.text,
        topics: q.topics,
        sourcePdf: paper.localPath,
        ...(typeof q.marksOnHeading === "number"
          ? { marksOnHeading: q.marksOnHeading }
          : {}),
      });
    }
  }
  return results;
}
