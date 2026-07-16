#!/usr/bin/env node
import { readFile, stat, readdir } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { PDFParse } from "pdf-parse";

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

function usage() {
  console.error(`
Usage:
  MARKER_API_URL=http://host:8000 node scripts/benchmark-marker.mjs [options] <pdf-or-dir>...

Environment:
  MARKER_API_URL          Marker base URL, without /marker/upload
  MARKER_API_TOKEN        Optional bearer token for protected Marker pods
  MARKER_PAGE_RANGE       Optional Marker page range, e.g. 0-2

Options:
  --concurrency 1,2,4,8   Concurrency levels to test. Default: 1
  --repeat 3              Repeat the file list N times per level. Default: 1
  --timeout-ms 900000     Per-request timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --min-chars-page 200    Flag suspiciously short output. Default: 200
  --page-range 0-2        Marker page range to process. Default: MARKER_PAGE_RANGE
  --label marker-1.10.2   Implementation/build label recorded in JSON
  --hourly-usd 0.587      Compute rate used for cost-per-1,000-page estimate
  --json                  Print JSON summary instead of a table

Examples:
  MARKER_API_URL=https://pod-8000.proxy.runpod.net \\
  MARKER_API_TOKEN=secret \\
    node scripts/benchmark-marker.mjs --concurrency 1,2,4,8 --repeat 2 ./demo-pdfs
`);
}

function parseArgs(argv) {
  const opts = {
    markerUrl: process.env.MARKER_API_URL,
    markerToken: process.env.MARKER_API_TOKEN?.trim(),
    concurrency: [1],
    repeat: 1,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    minCharsPerPage: 200,
    pageRange: process.env.MARKER_PAGE_RANGE?.trim() ?? "",
    label: process.env.MARKER_BENCH_LABEL?.trim() ?? "marker",
    hourlyUsd: null,
    json: false,
    paths: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--concurrency":
        opts.concurrency = argv[++i]
          .split(",")
          .map((value) => Number.parseInt(value, 10))
          .filter((value) => Number.isFinite(value) && value > 0);
        break;
      case "--repeat":
        opts.repeat = Number.parseInt(argv[++i], 10);
        break;
      case "--timeout-ms":
        opts.timeoutMs = Number.parseInt(argv[++i], 10);
        break;
      case "--min-chars-page":
        opts.minCharsPerPage = Number.parseInt(argv[++i], 10);
        break;
      case "--page-range":
        opts.pageRange = argv[++i]?.trim() ?? "";
        break;
      case "--label":
        opts.label = argv[++i]?.trim() ?? "marker";
        break;
      case "--hourly-usd":
        opts.hourlyUsd = Number.parseFloat(argv[++i]);
        break;
      case "--json":
        opts.json = true;
        break;
      case "-h":
      case "--help":
        usage();
        process.exit(0);
      default:
        if (arg.startsWith("-")) {
          throw new Error(`Unknown option: ${arg}`);
        }
        opts.paths.push(arg);
    }
  }

  if (!opts.markerUrl) {
    throw new Error("MARKER_API_URL is required");
  }
  if (opts.concurrency.length === 0) {
    throw new Error("At least one positive concurrency value is required");
  }
  if (!Number.isFinite(opts.repeat) || opts.repeat < 1) {
    throw new Error("--repeat must be a positive integer");
  }
  if (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs < 1000) {
    throw new Error("--timeout-ms must be at least 1000");
  }
  if (opts.paths.length === 0) {
    throw new Error("At least one file or directory is required");
  }
  if (opts.hourlyUsd != null && (!Number.isFinite(opts.hourlyUsd) || opts.hourlyUsd <= 0)) {
    throw new Error("--hourly-usd must be a positive number");
  }

  opts.markerUrl = opts.markerUrl.replace(/\/+$/, "");
  return opts;
}

async function collectFiles(inputPaths) {
  const files = [];
  for (const inputPath of inputPaths) {
    const fullPath = path.resolve(inputPath);
    const info = await stat(fullPath);
    if (info.isDirectory()) {
      const entries = await readdir(fullPath);
      for (const entry of entries) {
        const child = path.join(fullPath, entry);
        const childInfo = await stat(child);
        if (childInfo.isFile() && isSupportedFile(child)) {
          files.push(child);
        }
      }
    } else if (info.isFile() && isSupportedFile(fullPath)) {
      files.push(fullPath);
    }
  }
  return [...new Set(files)].sort();
}

function isSupportedFile(filePath) {
  return [".pdf", ".png", ".jpg", ".jpeg"].includes(path.extname(filePath).toLowerCase());
}

async function countPages(filePath, buffer) {
  if (path.extname(filePath).toLowerCase() !== ".pdf") return 1;
  const parser = new PDFParse({ data: buffer });
  try {
    const info = await parser.getInfo();
    return Number.isFinite(info.total) && info.total > 0 ? info.total : 1;
  } finally {
    await parser.destroy?.();
  }
}

function effectivePages(totalPages, pageRange) {
  if (!pageRange) return totalPages;

  const selected = new Set();
  for (const rawPart of pageRange.split(",")) {
    const part = rawPart.trim();
    if (!part) continue;
    if (part.includes("-")) {
      const [startRaw, endRaw] = part.split("-", 2);
      let start = Number.parseInt(startRaw, 10);
      let end = Number.parseInt(endRaw, 10);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      if (end < start) [start, end] = [end, start];
      for (let page = start; page <= end; page += 1) {
        if (page >= 0 && page < totalPages) selected.add(page);
      }
    } else {
      const page = Number.parseInt(part, 10);
      if (Number.isFinite(page) && page >= 0 && page < totalPages) {
        selected.add(page);
      }
    }
  }
  return selected.size;
}

function mimeType(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    default:
      return "application/pdf";
  }
}

async function loadInputs(files) {
  return Promise.all(
    files.map(async (filePath) => {
      const buffer = await readFile(filePath);
      return {
        path: filePath,
        name: path.basename(filePath),
        bytes: buffer.length,
        buffer,
        pages: await countPages(filePath, buffer),
      };
    }),
  );
}

async function callMarker(markerUrl, markerToken, input, timeoutMs, pageRange) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();

  try {
    const body = new FormData();
    const bytes = new Uint8Array(input.buffer.length);
    bytes.set(input.buffer);
    body.append("file", new Blob([bytes], { type: mimeType(input.path) }), input.name);
    body.append("output_format", "markdown");
    body.append("paginate_output", "false");
    if (pageRange) body.append("page_range", pageRange);

    const response = await fetch(`${markerUrl}/marker/upload`, {
      method: "POST",
      headers: markerToken ? { Authorization: `Bearer ${markerToken}` } : undefined,
      body,
      signal: controller.signal,
    });
    const elapsedMs = performance.now() - started;
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {}

    const output = typeof json?.output === "string" ? json.output : "";
    return {
      file: input.name,
      pages: effectivePages(input.pages, pageRange),
      bytes: input.bytes,
      ok: response.ok && json?.success !== false && output.length > 0,
      status: response.status,
      elapsedMs,
      outputChars: output.length,
      error: response.ok ? json?.error ?? null : text.slice(0, 300),
    };
  } catch (error) {
    return {
      file: input.name,
      pages: effectivePages(input.pages, pageRange),
      bytes: input.bytes,
      ok: false,
      status: 0,
      elapsedMs: performance.now() - started,
      outputChars: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runPool(tasks, concurrency, worker) {
  const results = [];
  let nextIndex = 0;

  async function runOne() {
    while (nextIndex < tasks.length) {
      const task = tasks[nextIndex++];
      results.push(await worker(task));
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, () => runOne()),
  );
  return results;
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function summarize(concurrency, started, ended, results, minCharsPerPage, hourlyUsd) {
  const ok = results.filter((result) => result.ok);
  const failed = results.filter((result) => !result.ok);
  const suspicious = ok.filter(
    (result) => result.pages > 0 && result.outputChars / result.pages < minCharsPerPage,
  );
  const totalPages = ok.reduce((sum, result) => sum + result.pages, 0);
  const totalBytes = ok.reduce((sum, result) => sum + result.bytes, 0);
  const elapsedSec = (ended - started) / 1000;
  const latencies = ok.map((result) => result.elapsedMs / 1000);

  const estimatedComputeUsd = hourlyUsd == null ? null : (elapsedSec / 3600) * hourlyUsd;
  return {
    concurrency,
    requests: results.length,
    ok: ok.length,
    failed: failed.length,
    suspicious: suspicious.length,
    pages: totalPages,
    mb: totalBytes / 1024 / 1024,
    elapsedSec,
    pagesPerSec: elapsedSec > 0 ? totalPages / elapsedSec : 0,
    estimatedComputeUsd,
    estimatedUsdPer1000Pages:
      estimatedComputeUsd != null && totalPages > 0
        ? (estimatedComputeUsd / totalPages) * 1000
        : null,
    avgLatencySec:
      latencies.length > 0
        ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length
        : 0,
    p95LatencySec: percentile(latencies, 95),
    failures: failed.slice(0, 5),
    suspiciousOutputs: suspicious.slice(0, 5),
  };
}

function formatNumber(value, digits = 2) {
  return value.toFixed(digits);
}

function printTable(summaries) {
  console.log(
    [
      "conc",
      "ok/req",
      "failed",
      "short",
      "pages",
      "sec",
      "pages/s",
      "avg_lat",
      "p95_lat",
    ].join("\t"),
  );
  for (const item of summaries) {
    console.log(
      [
        item.concurrency,
        `${item.ok}/${item.requests}`,
        item.failed,
        item.suspicious,
        item.pages,
        formatNumber(item.elapsedSec),
        formatNumber(item.pagesPerSec),
        formatNumber(item.avgLatencySec),
        formatNumber(item.p95LatencySec),
      ].join("\t"),
    );
  }
}

function printableInputs(inputs) {
  return inputs.map(({ buffer: _buffer, ...input }) => input);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const files = await collectFiles(opts.paths);
  if (files.length === 0) throw new Error("No supported files found");

  const inputs = await loadInputs(files);
  const tasks = Array.from({ length: opts.repeat }, () => inputs).flat();
  const totalPages = tasks.reduce(
    (sum, input) => sum + effectivePages(input.pages, opts.pageRange),
    0,
  );

  if (!opts.json) {
    console.error(`Marker URL: ${opts.markerUrl}`);
    console.error(`Files: ${inputs.length}; requests per level: ${tasks.length}; pages per level: ${totalPages}`);
    if (opts.pageRange) console.error(`Page range: ${opts.pageRange}`);
  }

  const summaries = [];
  for (const concurrency of opts.concurrency) {
    if (!opts.json) console.error(`\nRunning concurrency=${concurrency}`);
    const started = performance.now();
    const results = await runPool(tasks, concurrency, (input) =>
      callMarker(opts.markerUrl, opts.markerToken, input, opts.timeoutMs, opts.pageRange),
    );
    const ended = performance.now();
    summaries.push(
      summarize(
        concurrency,
        started,
        ended,
        results,
        opts.minCharsPerPage,
        opts.hourlyUsd,
      ),
    );
  }

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          label: opts.label,
          markerUrl: opts.markerUrl,
          hourlyUsd: opts.hourlyUsd,
          pageRange: opts.pageRange || null,
          files: printableInputs(inputs),
          summaries,
        },
        null,
        2,
      ),
    );
  } else {
    console.error("");
    printTable(summaries);
    for (const summary of summaries) {
      for (const failure of summary.failures) {
        console.error(
          `failure concurrency=${summary.concurrency} file=${failure.file} status=${failure.status} error=${failure.error}`,
        );
      }
      for (const output of summary.suspiciousOutputs) {
        console.error(
          `short-output concurrency=${summary.concurrency} file=${output.file} chars=${output.outputChars} pages=${output.pages}`,
        );
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  usage();
  process.exit(1);
});
