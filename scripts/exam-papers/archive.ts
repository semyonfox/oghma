import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { ARCHIVE, archiveUrl, isRecord, requestArchive } from "./bridge.ts";
import {
  paperFromFilename,
  saveCatalogue,
  storePdf,
  verifyLocal,
  type Catalogue,
  type Paper,
} from "./library.ts";
interface Slice {
  prefix: string;
  from: string;
  to: string;
}
interface ScanState {
  version: 1;
  scope: string;
  expected: number | null;
  pending: Slice[];
  rows: string[];
  requests: number;
}
interface SearchResult {
  total: number;
  limited: boolean;
  rows: string[];
  papers: { url: string; title: string; code?: string }[];
}
export function parseSearchResult(value: unknown): SearchResult {
  if (
    !isRecord(value) ||
    typeof value.total !== "number" ||
    !Number.isSafeInteger(value.total) ||
    value.total < 0 ||
    typeof value.limited !== "boolean" ||
    !Array.isArray(value.rows) ||
    !value.rows.every((r): r is string => typeof r === "string") ||
    !Array.isArray(value.papers)
  )
    throw new Error("Invalid archive result");
  const papers = value.papers.map((p) => {
    if (
      !isRecord(p) ||
      typeof p.url !== "string" ||
      typeof p.title !== "string"
    )
      throw new Error("Invalid archive paper");
    if (p.code !== undefined && typeof p.code !== "string")
      throw new Error("Invalid archive module code");
    archiveUrl(p.url);
    return {
      url: p.url,
      title: p.title,
      ...(typeof p.code === "string" ? { code: p.code } : {}),
    };
  });
  if (!value.limited && value.total !== value.rows.length)
    throw new Error(
      `Archive returned ${value.rows.length} rows for ${value.total} matches; scan is incomplete`,
    );
  return {
    total: value.total,
    limited: value.limited,
    rows: value.rows,
    papers,
  };
}
export function paperFromLink(link: {
  url: string;
  title: string;
  code?: string;
}): Paper {
  const url = archiveUrl(link.url);
  if (!url.pathname.endsWith("paper_index_download.asp"))
    throw new Error("Not an archive download link");
  const p = url.searchParams;
  const year = p.get("academic_session") ?? "";
  const nominal = link.code ?? p.get("paper_code_nominal") ?? "";
  const code =
    /^(?<module>[A-Z]{2,}\d+[A-Z0-9.]*)-(?<component>[A-Z0-9]+)$/i.exec(
      nominal,
    )?.groups;
  const sitting = p.get("assessment_sitting") ?? "",
    period = p.get("assessment_period") ?? "";
  if (
    !/^\d{4}$/.test(year) ||
    !code?.module ||
    !code.component ||
    !/^\d+$/.test(sitting) ||
    !/^\d+$/.test(period)
  )
    throw new Error("Unrecognised archive paper metadata");
  const irish = p.get("irish_flag")?.toLowerCase() === "true";
  const component = code.component;
  const filename = `${year}_${Number(year) + 1}_${code.module}_${component}_${sitting}_${period}.pdf`;
  const paper = paperFromFilename(
    filename,
    link.title + (irish ? " [Irish supplement]" : ""),
  );
  const archiveId = p.get("exam_paper_master") ?? "";
  if (!/^\d+$/.test(archiveId))
    throw new Error("Invalid archive paper identity");
  paper.archiveId = archiveId;
  paper.id += "@" + archiveId;
  if (irish) {
    paper.language = "ga";
    paper.id += "@ga";
  }
  paper.url = url.href;
  return paper;
}
export function splitSearch(slice: Slice): Slice[] {
  if (slice.prefix === "%")
    return [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"].map((c) => ({
      ...slice,
      prefix: c + "%",
    }));
  const from = Number(slice.from),
    to = Number(slice.to);
  if (from < to) {
    const mid = Math.floor((from + to) / 2);
    return [
      { ...slice, to: String(mid) },
      { ...slice, from: String(mid + 1) },
    ];
  }
  if (!slice.prefix.endsWith("%") || slice.prefix.length > 12)
    throw new Error(
      "Search still exceeds the archive limit; narrow the module scope",
    );
  return [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"].map((c) => ({
    ...slice,
    prefix: slice.prefix.slice(0, -1) + c + "%",
  }));
}
function readState(value: unknown, scope: string): ScanState {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    value.scope !== scope ||
    !Array.isArray(value.pending) ||
    !Array.isArray(value.rows) ||
    !value.rows.every((r): r is string => typeof r === "string") ||
    typeof value.requests !== "number" ||
    !(value.expected === null || typeof value.expected === "number")
  )
    throw new Error("Invalid scan checkpoint or changed scope; use --fresh");
  const pending = value.pending.map((s) => {
    if (
      !isRecord(s) ||
      typeof s.prefix !== "string" ||
      !/^[A-Z0-9]*%?$/.test(s.prefix) ||
      typeof s.from !== "string" ||
      !/^\d{4}$/.test(s.from) ||
      typeof s.to !== "string" ||
      !/^\d{4}$/.test(s.to)
    )
      throw new Error("Invalid scan checkpoint");
    return { prefix: s.prefix, from: s.from, to: s.to };
  });
  return {
    version: 1,
    scope,
    pending,
    rows: value.rows,
    expected: value.expected,
    requests: value.requests,
  };
}
export async function scanArchive(
  root: string,
  catalogue: Catalogue,
  scope = "%",
  fresh = false,
): Promise<void> {
  if (!/^[A-Z0-9]*%?$/.test(scope) || scope.length > 20 || !scope)
    throw new Error("Scan module must be one code or prefix, e.g. CT3*");
  const stateFile = path.join(root, "scan-state.json");
  let state: ScanState | undefined;
  if (!fresh) {
    try {
      state = readState(JSON.parse(await readFile(stateFile, "utf8")), scope);
    } catch (error) {
      if (!(isRecord(error) && error.code === "ENOENT")) throw error;
    }
  }
  if (!state) {
    const form = await requestArchive({
      kind: "form",
      url: ARCHIVE + "/regexam/paper_index_search_form.asp",
    });
    if (
      !isRecord(form) ||
      !Array.isArray(form.years) ||
      !form.years.every(
        (y): y is string => typeof y === "string" && /^\d{4}$/.test(y),
      ) ||
      !form.years.length
    )
      throw new Error("Archive did not provide academic years");
    const years = form.years.sort();
    const from = years[0],
      to = years.at(-1);
    if (!from || !to) throw new Error("No archive years");
    state = {
      version: 1,
      scope,
      expected: null,
      pending: [{ prefix: scope, from, to }],
      rows: [],
      requests: 0,
    };
  }
  if (!state.pending.length)
    console.log("Checking saved scan; use --fresh to refresh archive results");
  const rows = [...state.rows],
    byId = new Map(catalogue.papers.map((p) => [p.id, p]));
  if (scope === "%") catalogue.complete = false;
  while (state.pending.length) {
    const slice = state.pending[0];
    if (!slice) break;
    const result = parseSearchResult(
      await requestArchive({
        kind: "search",
        url: ARCHIVE + "/regexam/paper_index_search_results.asp",
        body: {
          module: slice.prefix,
          module_title_and_or_ind: "AND",
          ay_1: slice.from,
          ay_2: slice.to,
        },
      }),
    );
    if (state.expected === null) state.expected = result.total;
    // parse every link before advancing the checkpoint, so a format change can't lose work
    const parsed = result.papers.map(paperFromLink);
    if (result.limited) {
      state.pending.splice(0, 1, ...splitSearch(slice));
    } else {
      state.pending.shift();
      rows.push(...result.rows);
      for (const paper of parsed) {
        const existing = byId.get(paper.id);
        if (existing)
          Object.assign(existing, { url: paper.url, title: paper.title });
        else {
          byId.set(paper.id, paper);
          catalogue.papers.push(paper);
        }
      }
    }
    state.requests++;
    state.rows = [...rows];
    await mkdir(root, { recursive: true });
    await saveCatalogue(root, catalogue);
    await writeFile(stateFile + ".tmp", JSON.stringify(state), { mode: 0o600 });
    await rename(stateFile + ".tmp", stateFile);
    console.log(
      `${slice.prefix} ${slice.from}-${slice.to}: ${result.total}${result.limited ? " (split)" : ""}; ${rows.length}/${state.expected} rows, ${state.pending.length} searches pending`,
    );
    await delay(700);
  }
  catalogue.scannedAt = new Date().toISOString();
  if (rows.length !== state.expected) {
    if (scope === "%") catalogue.complete = false;
    await saveCatalogue(root, catalogue);
    throw new Error(
      `Scan count mismatch: found ${rows.length} of ${state.expected} rows. Kept the results, but cannot claim full coverage.`,
    );
  }
  if (scope === "%") catalogue.complete = true;
  await saveCatalogue(root, catalogue);
  console.log(
    `Scan complete: ${rows.length} matched rows; catalogue contains ${catalogue.papers.length} downloadable papers. Unreleased rows have no download link.`,
  );
}
export async function downloadSelected(
  root: string,
  papers: Paper[],
  catalogue: Catalogue,
): Promise<void> {
  let downloaded = 0,
    skipped = 0;
  for (const paper of papers) {
    if (await verifyLocal(root, paper)) {
      skipped++;
      continue;
    }
    if (!paper.url) {
      console.log(`No archive link: ${paper.filename}`);
      continue;
    }
    const result = await requestArchive({ kind: "pdf", url: paper.url });
    if (
      !isRecord(result) ||
      typeof result.bytes !== "string" ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(result.bytes)
    )
      throw new Error("Invalid PDF response");
    await storePdf(root, paper, Buffer.from(result.bytes, "base64"));
    await saveCatalogue(root, catalogue);
    downloaded++;
    console.log(`Downloaded ${paper.filename}`);
    await delay(700);
  }
  console.log(`${downloaded} downloaded, ${skipped} already verified`);
}
