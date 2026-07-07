#!/usr/bin/env node
import {
  ListObjectsV2Command,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { readFile } from "node:fs/promises";

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
    minBytes: 1024,
    maxBytes: 50 * 1024 * 1024,
    json: false,
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
  return keys.slice(0, opts.limit);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  await loadEnvFile(opts.envFile);

  const bucket = required("STORAGE_BUCKET");
  const rawPrefix = opts.prefix ?? process.env.STORAGE_PREFIX ?? "";
  const prefix = rawPrefix ? `${rawPrefix.replace(/\/$/, "")}/` : "";
  const client = createClient();

  const objects = await listPdfObjects(client, bucket, prefix, opts);
  if (objects.length === 0) {
    throw new Error(`No PDF objects found under prefix ${prefix || "(none)"}`);
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
    `signed ${signed.length} PDFs from ${bucket}/${prefix} (${totalMb.toFixed(1)} MB total)`,
  );

  if (opts.json) {
    console.log(JSON.stringify(signed, null, 2));
  } else {
    for (const item of signed) console.log(item.url);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  usage();
  process.exit(1);
});
