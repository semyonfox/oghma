#!/usr/bin/env node
import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { readFile } from "node:fs/promises";
import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const DEFAULT_ENV_FILE = "/home/semyon/jenkins/env/oghma-prod.env";

function usage() {
  console.error(`
Usage:
  node scripts/generate-marker-bench-urls.mjs [options]

Options:
  --env /path/file.env       Env file with STORAGE_* values. Default: ${DEFAULT_ENV_FILE}
  --limit 120                Max signed URLs. Default: 120
  --expires 7200             Signed URL lifetime in seconds. Default: 7200
  --prefix oghma             Storage prefix. Default: STORAGE_PREFIX
  --user-id UUID             Restrict selection to canvas/<user-id>/ objects
  --strategy balanced        largest or balanced. Default: balanced
  --seed TEXT                Deterministic seed for stratified-random selection
  --manifest /path/file.json Write a URL-free, key-free corpus manifest
  --selection /path/file.json Write a private exact selection (contains keys)
  --from-selection /path.json Sign keys from an existing private selection
  --refresh-metadata          Accept changed timestamps only when every saved byte size still matches
  --min-bytes 1024           Minimum object size. Default: 1024
  --max-bytes 52428800       Maximum object size. Default: 52428800
  --json                     Output JSON array instead of plain URL lines
`);
}

function parseArgs(argv) {
  const opts = {
    envFile: DEFAULT_ENV_FILE,
    limit: 120,
    expires: 7200,
    prefix: undefined,
    userId: undefined,
    strategy: "balanced",
    manifest: undefined,
    selection: undefined,
    fromSelection: undefined,
    seed: "oghma-marker-20260716",
    minBytes: 1024,
    maxBytes: 50 * 1024 * 1024,
    json: false,
    refreshMetadata: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--env":
        opts.envFile = argv[++i];
        break;
      case "--limit":
        opts.limit = Number.parseInt(argv[++i], 10);
        break;
      case "--expires":
        opts.expires = Number.parseInt(argv[++i], 10);
        break;
      case "--prefix":
        opts.prefix = argv[++i];
        break;
      case "--user-id":
        opts.userId = argv[++i];
        break;
      case "--strategy":
        opts.strategy = argv[++i];
        break;
      case "--manifest":
        opts.manifest = argv[++i];
        break;
      case "--selection":
        opts.selection = argv[++i];
        break;
      case "--from-selection":
        opts.fromSelection = argv[++i];
        break;
      case "--refresh-metadata":
        opts.refreshMetadata = true;
        break;
      case "--seed":
        opts.seed = argv[++i];
        break;
      case "--min-bytes":
        opts.minBytes = Number.parseInt(argv[++i], 10);
        break;
      case "--max-bytes":
        opts.maxBytes = Number.parseInt(argv[++i], 10);
        break;
      case "--json":
        opts.json = true;
        break;
      case "-h":
      case "--help":
        usage();
        process.exit(0);
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!Number.isFinite(opts.limit) || opts.limit < 1) {
    throw new Error("--limit must be a positive integer");
  }
  if (!Number.isFinite(opts.expires) || opts.expires < 60) {
    throw new Error("--expires must be at least 60");
  }
  if (!new Set(["largest", "balanced", "stratified-random"]).has(opts.strategy)) {
    throw new Error("--strategy must be largest, balanced, or stratified-random");
  }
  if (opts.userId && !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(opts.userId)) {
    throw new Error("--user-id must be a UUID");
  }
  return opts;
}

async function loadEnvFile(path) {
  const contents = await readFile(path, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] != null) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function createClient() {
  return new S3Client({
    region: process.env.STORAGE_REGION || "us-east-1",
    endpoint: process.env.STORAGE_ENDPOINT,
    forcePathStyle: process.env.STORAGE_PATH_STYLE === "true",
    credentials:
      process.env.STORAGE_ACCESS_KEY && process.env.STORAGE_SECRET_KEY
        ? {
            accessKeyId: process.env.STORAGE_ACCESS_KEY,
            secretAccessKey: process.env.STORAGE_SECRET_KEY,
          }
        : undefined,
  });
}

async function listPdfObjects(client, bucket, prefix, opts) {
  const keys = [];
  let ContinuationToken;
  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken,
        MaxKeys: 1000,
      }),
    );
    for (const item of response.Contents ?? []) {
      const key = item.Key ?? "";
      const size = item.Size ?? 0;
      if (!key.toLowerCase().endsWith(".pdf")) continue;
      if (size < opts.minBytes || size > opts.maxBytes) continue;
      keys.push({ key, size, lastModified: item.LastModified?.toISOString() });
    }
    ContinuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (ContinuationToken && keys.length < opts.limit * 10);

  keys.sort((a, b) => {
    const sizeCompare = b.size - a.size;
    return sizeCompare || a.key.localeCompare(b.key);
  });
  if (opts.strategy === "largest" || keys.length <= opts.limit) {
    return keys.slice(0, opts.limit);
  }

  if (opts.strategy === "stratified-random") {
    const score = (key) =>
      createHash("sha256").update(`${opts.seed}\0${key}`).digest("hex");
    const selected = [];
    for (let index = 0; index < opts.limit; index += 1) {
      const start = Math.floor((index * keys.length) / opts.limit);
      const end = Math.max(start + 1, Math.floor(((index + 1) * keys.length) / opts.limit));
      const stratum = keys.slice(start, end).sort((a, b) =>
        score(a.key).localeCompare(score(b.key)),
      );
      selected.push(stratum[0]);
    }
    return selected;
  }

  // Select evenly across the size-sorted population. This produces a stable
  // small/medium/large mix without inspecting document contents or names.
  const selected = [];
  const used = new Set();
  if (opts.limit === 1) return [keys[0]];
  for (let index = 0; index < opts.limit; index += 1) {
    const position = Math.round((index * (keys.length - 1)) / (opts.limit - 1));
    if (!used.has(position)) {
      used.add(position);
      selected.push(keys[position]);
    }
  }
  return selected;
}

async function revalidateSelection(client, bucket, objects, refreshMetadata = false) {
  const validated = [];
  for (let index = 0; index < objects.length; index += 1) {
    const object = objects[index];
    const current = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: object.key }),
    );
    const size = current.ContentLength ?? 0;
    const lastModified = current.LastModified?.toISOString();
    if (size !== object.size) {
      throw new Error(`saved corpus selection size mismatch at ordinal ${index + 1}`);
    }
    if (!refreshMetadata && object.lastModified && lastModified !== object.lastModified) {
      throw new Error(`saved corpus selection metadata mismatch at ordinal ${index + 1}`);
    }
    validated.push({ ...object, size, lastModified });
  }
  return validated;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  await loadEnvFile(opts.envFile);

  const bucket = required("STORAGE_BUCKET");
  const rawPrefix = opts.prefix ?? process.env.STORAGE_PREFIX ?? "";
  const basePrefix = rawPrefix ? `${rawPrefix.replace(/\/$/, "")}/` : "";
  const prefix = opts.userId
    ? `${basePrefix}canvas/${opts.userId}/`
    : basePrefix;
  const client = createClient();

  let objects;
  if (opts.fromSelection) {
    const saved = JSON.parse(await readFile(opts.fromSelection, "utf8"));
    if (saved.bucket !== bucket) throw new Error("selection bucket does not match environment");
    objects = await revalidateSelection(client, bucket, saved.files, opts.refreshMetadata);
  } else {
    objects = await listPdfObjects(client, bucket, prefix, opts);
  }
  if (objects.length === 0) {
    throw new Error("no PDF objects matched the selection criteria");
  }

  const signed = [];
  for (const object of objects) {
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: object.key }),
      { expiresIn: opts.expires },
    );
    signed.push({ ...object, url });
  }

  const totalMb = signed.reduce((sum, item) => sum + item.size, 0) / 1024 / 1024;
  console.error(
    `signed ${signed.length} PDFs (${totalMb.toFixed(1)} MB total)`,
  );

  if (opts.manifest) {
    const manifest = {
      generatedAt: new Date().toISOString(),
      strategy: opts.strategy,
      seed: opts.strategy === "stratified-random" ? opts.seed : null,
      userScoped: Boolean(opts.userId),
      count: signed.length,
      totalBytes: signed.reduce((sum, item) => sum + item.size, 0),
      files: signed.map((item, index) => ({
        ordinal: index + 1,
        file: `pdf-${String(index + 1).padStart(3, "0")}.pdf`,
        bytes: item.size,
      })),
    };
    await writeFile(opts.manifest, `${JSON.stringify(manifest, null, 2)}\n`, {
      mode: 0o600,
    });
    console.error("wrote URL-free corpus manifest");
  }


  if (opts.selection) {
    const selection = {
      generatedAt: new Date().toISOString(),
      bucket,
      prefix,
      strategy: opts.strategy,
      seed: opts.seed,
      files: signed.map(({ key, size, lastModified }) => ({ key, size, lastModified })),
    };
    await writeFile(opts.selection, `${JSON.stringify(selection, null, 2)}\n`, {
      mode: 0o600,
    });
    console.error("wrote private exact selection");
  }

  if (opts.json) {
    console.log(JSON.stringify(signed, null, 2));
  } else {
    for (const item of signed) console.log(item.url);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "";
  const category = message.startsWith("selection bucket")
    ? "selection_bucket_mismatch"
    : message.startsWith("saved corpus selection size")
      ? "selection_size_mismatch"
      : message.startsWith("saved corpus selection")
        ? "selection_metadata_mismatch"
      : error instanceof Error && /^[A-Za-z][A-Za-z0-9_.-]{0,80}$/.test(error.name)
        ? error.name
        : "unknown";
  const ordinal = message.match(/ordinal (\d+)$/)?.[1];
  console.error(`marker URL generation failed (${category}${ordinal ? ` at ordinal ${ordinal}` : ""}); inspect the private operator environment`);
  usage();
  process.exit(1);
});
