# Exam papers

Download Galway past exam papers into a local library, filter them your own way, and split their text into questions with source page references.

> Status: current implementation
> Last reviewed: 2026-10-14

## Import into a module

The scraper runs on the laptop where the Galway archive is signed in. OghmaNotes stores selected papers as original PDF files with linked text notes. Each PDF is explicitly a `past_paper` material in the module map you import into.

```sh
npm run papers -- export --module CT318 --year 2025
```

Open that module in Study Map, choose its Exam history tab, and use **Choose exam files** to select the generated `.oghma-exam.json` files under `exam-library/oghma/`. Check the module codes and target module in the preview, then choose **Import**. Up to 20 files can be selected at once; requests run one at a time. A module needs a folder before importing.

The PDF and its linked text go under the selected module folder. Both inherit the map’s Canvas course ID and course academic year when present, so course-scoped study and quiz retrieval can find their embeddings. The paper’s original academic year, sitting and period remain in its filename, text and labels. A 2021 exam can therefore belong to the current course without being relabelled as a 2026 paper. The target module is an explicit choice; a code match is not proof of enrolment.

The note-indexing worker builds embeddings from the full extracted page text. Study Map follows the explicit PDF/text link for evidence. The linked text is excluded as a second material so folder sync does not show duplicate cards. Importing does not approve an exam structure or run a new paper-analysis request. Use **Analyse paper** and the existing review flow before including it in historical coverage. Classification may still run through a map’s existing automatic settings.

Imports validate metadata, PDF bytes and SHA-256. Reimporting the same PDF into the same map preserves notes and edits and retries indexing. If indexing could not be queued, **Retry** repeats that step without creating another pair. Trashed or partially removed pairs must be restored or permanently deleted before reimport. A duplicate does not undo a manual removal from a map. Distinct maps keep their own copies.

Exports retain every page, including instructions and appendices, using `[Page N]` markers understood by Study Map. Question splitting is a separate local convenience and never determines which text reaches embeddings. Exports include the PDF and text, never archive session credentials or local paths. They are private study files, not source code. No existing archive data is uploaded merely by running the CLI.

## Setup

Requires Node.js 24+ and `pdftotext`. On CachyOS it comes with `poppler`; on Ubuntu, `poppler-utils`.

```sh
npm ci
npm run test:papers
```

## Connect to the archive

Run this on the computer where you are signed in to the university archive:

```sh
npm run papers -- connect
```

Open <https://regexam.nuigalway.ie/regexam/paper_index_search_main_menu.asp>, sign in, open the browser's developer console, and run the connection command printed by `connect`. Allow local-network access if the browser asks. Keep both the tab and the command running. Use a second terminal for scan and download commands.

The helper sends archive requests through that browser session. It never reads or exports cookies, passwords or access tokens. The bridge listens only on `127.0.0.1:18763`, accepts browser requests only from the archive origin, and limits requests to its search and download endpoints. Close it with Ctrl+C when finished. Reconnect after restarting the browser or bridge. Sign in again if the university session expires.

## Find papers

```sh
npm run papers -- scan
npm run papers -- list --module 'CT3*' --sort=-year
npm run papers -- list --module CT318,CT3531 --year 2025 --sitting 1
npm run papers -- list --search database --json
```

`scan` indexes all available years. The archive rejects searches with more than 500 matches, so the script divides searches by module prefix and year range. It compares the number of rows collected with the archive's total before marking the scan complete. Rows with no download link are counted but cannot be downloaded. The catalogue contains only downloadable papers, plus local imports.

Progress is saved after each successful search. Rerun the same command after an interruption to resume, or use `scan --fresh` to refresh the catalogue. A narrow scan is also supported: `scan --module 'CT3*' --fresh`. A narrow scan never marks the whole archive complete. Existing local papers are kept. The catalogue is cumulative; a refresh does not delete papers that have disappeared from search results.

## Download and extract

```sh
npm run papers -- download --module 'CT3*' --year 2025 --sort=-year
npm run papers -- extract --module 'CT3*' --rules scripts/exam-papers/rules.example.json
npm run papers -- questions --module 'CT3*' --text usability
npm run papers -- questions --topic networks --jsonl > network-questions.jsonl
```

Downloads run one at a time with a delay, check the PDF signature, and save a SHA-256 hash. Reruns skip verified files. Existing files with different contents are never replaced. A failed download stops the command; reconnect or refresh the scan and rerun it. Use `--limit 5` for a small batch. Downloading everything requires `download --all`.

The original PDF stays intact. Each extracted paper has:

- JSON containing page text, question blocks, page numbers and optional marks/topics
- a Markdown document linking each question to its original PDF page
- a text file preserving all extracted page text, including material outside questions

`questions` can emit JSON arrays or JSONL for later processing. `--text` searches question text; `--topic` selects a topic assigned by your rules. `--search` filters paper titles or filenames. Paper filters work on both `list` and `questions`.

Text extraction is heuristic. Diagrams are retained in the PDF, not recreated in text. Equations and tables can lose their layout; scanned pages need separate OCR. The splitter keeps subparts within their main question and warns about missing text or ambiguous headings. Marks are exported as `marksOnHeading`, because a mark beside a subpart is not necessarily the total. Formula sheets and appendices can remain attached to the final question; check the page links.

## Your sorting and rules

Copy `scripts/exam-papers/rules.example.json` to a file of your own and edit the collections and keywords. `ct3` is a module-code prefix, not a verified list of your enrolled modules.

```json
{
  "collections": { "this-semester": ["CT318", "CT3531", "CT3532"] },
  "topics": { "routing": ["routing table", "subnet", "OSPF"] }
}
```

```sh
npm run papers -- list --rules my-rules.json --collection this-semester --sort=-year
npm run papers -- download --rules my-rules.json --collection this-semester
npm run papers -- extract --rules my-rules.json --collection this-semester
npm run papers -- questions --rules my-rules.json --collection this-semester --topic routing
```

Topic rules match whole words or phrases, ignoring case and layout whitespace. Rerun `extract` after changing topic rules. Collections accept exact module codes and trailing `*` prefixes. Comma-separated filters are supported for modules, academic years, sittings and periods. Sort by `module`, `year`, `-year`, `sitting`, or `title`.

Sitting and period are separate. Sitting `1` is first sitting and `2` is repeat. Period codes are `5` semester 1, `1` spring, `2` summer, `13` summer resits, and `3` autumn. A bare year such as `2025` means academic year `2025/2026`.

## Existing papers and file layout

```sh
npm run papers -- import /path/to/existing/papers
npm run papers -- extract --rules scripts/exam-papers/rules.example.json
```

Imports copy recognised PDFs and leave the originals alone. They report unsupported filenames and duplicates. Existing JSON from other pipelines is not overwritten or imported automatically.

By default, everything goes into the gitignored `exam-library/` directory. Override this with `--library /path/to/library` on each command. The library contains `catalogue.json`, `scan-state.json`, `papers/` and `extracted/`. Papers are grouped by module and academic year. Archive downloads also get a directory for the source paper ID so distinct papers and Irish supplements cannot overwrite each other. Filenames retain the archive's module/component/sitting/period convention.

The library allows one writer at a time. If a process is forcibly killed, `.lock` may remain; it contains the PID. Check that process has stopped before removing only that lock file. The next scan resumes from its last completed search. A catalogue marked complete describes the last full scan, not a guarantee that the university has released every paper.

## Implementation

The route is `POST /api/study-maps/[id]/papers/import`. It uses the existing note, attachment, study-material and reindexing services; no migration or new service is required. The request is a single bounded JSON exam import with a 32 MiB PDF limit and a 320,000-character text limit. The bridge and `pdftotext` run only on the laptop, so the app container needs no Poppler installation.

Source is under `scripts/exam-papers/`; the shared import schema and persistence live under `src/lib/study-map/`. The scripts have a separate strict Node TypeScript check, included by `npm run typecheck`, and their tests run under `npm run test:ci`.

## Parser API

`parseExamPaperText` still accepts already extracted text. `extractPaper(path)` reads a PDF with `pdftotext` and returns page text, question blocks and warnings. `parseExamFilename` exposes `sitting` and `period` separately. Older versions mislabeled the final period field as sitting.
