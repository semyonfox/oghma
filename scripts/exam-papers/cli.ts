#!/usr/bin/env node
import { parseArgs } from "node:util";
import path from "node:path";
import { mkdir, open, unlink } from "node:fs/promises";
import { exportForOghma } from "./export.ts";
import { startBridge } from "./bridge.ts";
import { scanArchive, downloadSelected } from "./archive.ts";
import {
  readCatalogue,
  saveCatalogue,
  readRules,
  filterPapers,
  importPapers,
  extractSelected,
  readQuestions,
  type Filters,
} from "./library.ts";

const help = `Usage: npm run papers -- COMMAND [options]

  connect            Connect the signed-in laptop archive tab, keep running
  scan               Index all available archive years, resume after interruptions
  list               Filter and sort the saved catalogue, offline
  download           Download selected PDFs, resume and verify existing files
  import DIRECTORY   Add PDFs already on disk, preserve the originals
  export             Prepare local PDFs for import into a module in OghmaNotes
  questions          Search/filter extracted questions, offline
  extract            Export local PDFs as question JSON, Markdown and full text

Options:
  --output PATH      Export directory, default LIBRARY/oghma
  --library PATH     Library directory, default ./exam-library
  --module CT3*      Module code, prefix, or comma-separated codes
  --year 2025        Starting year, full academic year, or comma-separated years
  --sitting 1        1 = first sitting, 2 = repeat
  --period 5         5 = semester 1, 2 = summer, 3 = autumn, 1 = spring, 13 = resits
  --search WORD      Search module titles and codes
  --rules FILE       Custom collections and question topic keywords
  --collection NAME Select a collection from the rules file
  --sort=-year       module, year, -year, sitting, title
  --limit N          Limit selected results/downloads
  --text WORD        Search question text with questions
  --topic NAME       Filter question topics with questions
  --json             Print list/questions as JSON
  --jsonl            Print one record per line for downstream tools
  --fresh            Start a fresh scan, keep existing papers
  --all              Explicitly select every paper for download

Run connect, attach the archive tab using the printed command, then scan/download
in another terminal on the same laptop. The university session stays in the browser.
`;
async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      library: { type: "string" },
      output: { type: "string" },
      module: { type: "string" },
      year: { type: "string" },
      sitting: { type: "string" },
      period: { type: "string" },
      search: { type: "string" },
      rules: { type: "string" },
      collection: { type: "string" },
      sort: { type: "string" },
      limit: { type: "string" },
      text: { type: "string" },
      topic: { type: "string" },
      jsonl: { type: "boolean" },
      json: { type: "boolean" },
      fresh: { type: "boolean" },
      all: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  const command = positionals[0];
  if (values.help || !command) {
    console.log(help);
    return;
  }
  if (command === "connect") {
    startBridge();
    return;
  }
  if (
    ![
      "scan",
      "list",
      "download",
      "import",
      "extract",
      "questions",
      "export",
    ].includes(command)
  )
    throw new Error(`Unknown command: ${command}`);
  if (positionals.length > (command === "import" ? 2 : 1))
    throw new Error("Unexpected positional argument");
  const root = path.resolve(values.library ?? "exam-library");
  const catalogue = await readCatalogue(root),
    rules = await readRules(values.rules);
  const filters: Filters = {};
  for (const key of [
    "module",
    "year",
    "sitting",
    "period",
    "search",
    "collection",
    "sort",
  ] as const)
    if (values[key] !== undefined) filters[key] = values[key];
  let papers = filterPapers(catalogue.papers, filters, rules);
  if (command === "extract" || command === "export") {
    papers = papers.filter((paper) => paper.localPath !== undefined);
  }
  if (values.limit !== undefined) {
    if (
      !/^[1-9]\d*$/.test(values.limit) ||
      !Number.isSafeInteger(Number(values.limit))
    )
      throw new Error("Limit must be a positive integer");
    if (command !== "questions") papers = papers.slice(0, Number(values.limit));
  }
  if (command === "questions") {
    let questions = await readQuestions(
      root,
      papers,
      values.text,
      values.topic,
    );
    if (values.limit) questions = questions.slice(0, Number(values.limit));
    if (values.jsonl)
      for (const question of questions) console.log(JSON.stringify(question));
    else if (values.json) console.log(JSON.stringify(questions, null, 2));
    else {
      for (const q of questions)
        console.log(
          `${q.moduleCode} ${q.academicYear} Q${q.number} pages ${q.pageStart}-${q.pageEnd}\n${q.text}\n`,
        );
      console.log(`${questions.length} questions`);
    }
    return;
  }
  if (values.text || values.topic)
    throw new Error("--text and --topic apply to the questions command");
  if (command === "list") {
    if (values.jsonl)
      for (const paper of papers) console.log(JSON.stringify(paper));
    else if (values.json) console.log(JSON.stringify(papers, null, 2));
    else {
      for (const p of papers)
        console.log(
          `${p.moduleCode}\t${p.academicYear}\tsitting ${p.sitting}\tperiod ${p.period}\t${p.localPath ? "local" : "remote"}\t${p.title}\t${p.filename}`,
        );
      console.log(`${papers.length} papers`);
    }
    return;
  }
  await mkdir(root, { recursive: true });
  const lockFile = path.join(root, ".lock");
  let lock;
  try {
    lock = await open(lockFile, "wx", 0o600);
  } catch {
    throw new Error(
      `Library is locked: ${lockFile}. If a previous run crashed, check its process before removing the lock.`,
    );
  }
  await lock.writeFile(String(process.pid));
  try {
    if (command === "scan") {
      if (
        values.year ||
        values.sitting ||
        values.period ||
        values.search ||
        values.collection ||
        values.limit
      )
        throw new Error(
          "Scan accepts only --module as scope. Filter the saved catalogue with list/download.",
        );
      await scanArchive(
        root,
        catalogue,
        (values.module ?? "*").toUpperCase().replace(/\*$/, "%"),
        values.fresh,
      );
    } else if (command === "import") {
      const directory = positionals[1];
      if (!directory) throw new Error("Provide the directory to import");
      const result = await importPapers(
        root,
        path.resolve(directory),
        catalogue,
      );
      await saveCatalogue(root, catalogue);
      console.log(JSON.stringify(result, null, 2));
    } else if (command === "download") {
      if (
        !values.all &&
        !values.module &&
        !values.collection &&
        !values.year &&
        !values.search &&
        !values.limit
      )
        throw new Error(
          "Choose a module/collection/year/search/limit or pass --all to download the whole archive",
        );
      if (!papers.length)
        throw new Error("No papers match. Run scan first or adjust filters.");
      await downloadSelected(root, papers, catalogue);
    } else if (command === "export") {
      if (!papers.length)
        throw new Error(
          "No local papers match. Download or import PDFs first.",
        );
      console.log(
        JSON.stringify(
          await exportForOghma(
            root,
            papers,
            path.resolve(values.output ?? path.join(root, "oghma")),
          ),
          null,
          2,
        ),
      );
    } else {
      if (!papers.length)
        throw new Error(
          "No local papers match. Download or import PDFs first.",
        );
      const result = await extractSelected(root, papers, rules);
      await saveCatalogue(root, catalogue);
      console.log(JSON.stringify(result, null, 2));
    }
  } finally {
    await lock.close();
    await unlink(lockFile);
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Command failed");
  process.exitCode = 1;
});
