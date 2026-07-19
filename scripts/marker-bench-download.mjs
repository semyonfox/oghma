#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { performance } from "node:perf_hooks";

const [urlFile, outputDir, logFile, expectedFile] = process.argv.slice(2);
if (!urlFile || !outputDir || !logFile) {
  console.error(
    "usage: marker-bench-download.mjs URL_FILE OUTPUT_DIR DOWNLOADS_JSONL [EXPECTED_ATTESTATION_JSON]",
  );
  process.exit(2);
}

await mkdir(outputDir, { recursive: true });
await writeFile(logFile, "", { mode: 0o600 });
const urls = (await readFile(urlFile, "utf8")).split(/\r?\n/).filter(Boolean);
const expected = expectedFile
  ? JSON.parse(await readFile(expectedFile, "utf8")).documents
  : null;

if (expected && (!Array.isArray(expected) || expected.length !== urls.length)) {
  throw new Error("expected attestation does not match URL count");
}

const records = [];
for (let index = 0; index < urls.length; index += 1) {
  const ordinal = index + 1;
  const started = performance.now();
  const name = `pdf-${String(ordinal).padStart(3, "0")}.pdf`;
  const destination = join(outputDir, name);
  const partial = `${destination}.partial`;
  const digest = createHash("sha256");
  let status = 0;
  let bytes = 0;
  let sha256 = null;
  let errorCategory = null;
  try {
    const response = await fetch(urls[index], { redirect: "follow" });
    status = response.status;
    if (!response.ok || !response.body) {
      throw new Error("http");
    }
    const hasher = new Transform({
      transform(chunk, _encoding, callback) {
        digest.update(chunk);
        callback(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(response.body),
      hasher,
      createWriteStream(partial, { mode: 0o600 }),
    );
    bytes = (await stat(partial)).size;
    sha256 = digest.digest("hex");
    const expectedDocument = expected?.[index];
    if (
      expectedDocument &&
      (expectedDocument.ordinal !== ordinal ||
        expectedDocument.file !== name ||
        expectedDocument.bytes !== bytes ||
        expectedDocument.sha256 !== sha256)
    ) {
      throw new Error("attestation");
    }
    await rename(partial, destination);
  } catch (caught) {
    const kind = caught instanceof Error ? caught.message : "download";
    errorCategory =
      kind === "attestation"
        ? "attestation_mismatch"
        : kind === "http"
          ? "http_error"
          : "download_error";
    await rm(partial, { force: true });
  }
  const record = {
    ordinal,
    status,
    bytes,
    sha256,
    durationMs: Math.round(performance.now() - started),
    errorCategory,
  };
  records.push(record);
  await writeFile(logFile, `${JSON.stringify(record)}\n`, {
    flag: "a",
    mode: 0o600,
  });
  console.error(
    `document ${ordinal}: ${errorCategory ?? `${bytes} bytes`} in ${record.durationMs} ms`,
  );
  if (errorCategory) process.exitCode = 1;
}

const summary = {
  schemaVersion: 1,
  documents: records.length,
  successfulDocuments: records.filter((record) => !record.errorCategory).length,
  totalBytes: records.reduce((sum, record) => sum + record.bytes, 0),
  totalDurationMs: records.reduce((sum, record) => sum + record.durationMs, 0),
  failures: records.filter((record) => record.errorCategory).length,
};
await writeFile(
  join(dirname(logFile), "downloads-summary.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
  { mode: 0o600 },
);
