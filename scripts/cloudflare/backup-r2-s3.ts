#!/usr/bin/env node

import { createWriteStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
  type _Object,
} from "@aws-sdk/client-s3";

const endpoint =
  process.env.STORAGE_ENDPOINT ||
  "https://0ad6ea198f98f461111d3fdf1abecf3c.r2.cloudflarestorage.com";
const bucket = process.env.STORAGE_BUCKET || "oghma-notes";
const accessKeyId = process.env.STORAGE_ACCESS_KEY;
const secretAccessKey = process.env.STORAGE_SECRET_KEY;
const root =
  process.argv[2] ||
  `/home/semyon/backups/oghma-r2-company-s3-${new Date().toISOString().slice(0, 10)}`;
const concurrency = Number(process.env.CONCURRENCY || 8);

if (!accessKeyId || !secretAccessKey) {
  throw new Error("Set STORAGE_ACCESS_KEY and STORAGE_SECRET_KEY");
}
if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
  throw new Error("CONCURRENCY must be a positive integer");
}

const s3 = new S3Client({
  region: "auto",
  endpoint,
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function objectKey(object: _Object): string {
  if (!object.Key) throw new Error("S3 returned an object without a key");
  return object.Key;
}

function isNodeReadable(value: unknown): value is Readable {
  return value instanceof Readable;
}

async function listAll(): Promise<_Object[]> {
  const objects: _Object[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      }),
    );
    objects.push(...(response.Contents ?? []));
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return objects;
}

async function existsWithSize(filePath: string, size: number | undefined): Promise<boolean> {
  try {
    return (await stat(filePath)).size === (size ?? 0);
  } catch {
    return false;
  }
}

async function download(object: _Object): Promise<"downloaded" | "skipped"> {
  const key = objectKey(object);
  const outputPath = join(root, "objects", key);
  await mkdir(dirname(outputPath), { recursive: true });

  if (await existsWithSize(outputPath, object.Size)) return "skipped";

  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!isNodeReadable(response.Body)) {
    throw new Error(`S3 object body is not a Node stream: ${key}`);
  }

  await pipeline(response.Body, createWriteStream(outputPath));
  return "downloaded";
}

await mkdir(root, { recursive: true });
const objects = await listAll();
const manifest = {
  endpointAccount: endpoint.match(/https:\/\/([^.]+)/)?.[1],
  bucket,
  count: objects.length,
  totalBytes: objects.reduce((total, object) => total + Number(object.Size ?? 0), 0),
  objects: objects.map((object) => ({
    key: object.Key,
    size: object.Size,
    etag: object.ETag,
    lastModified: object.LastModified,
  })),
};

const manifestPath = join(root, "manifest.json");
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`Manifest written: ${manifestPath}`);
console.log(`Objects: ${manifest.count}; bytes: ${manifest.totalBytes}`);

let nextObjectIndex = 0;
let downloaded = 0;
let skipped = 0;
let failed = 0;

async function worker(): Promise<void> {
  for (;;) {
    const object = objects[nextObjectIndex];
    nextObjectIndex += 1;
    if (!object) return;

    try {
      const result = await download(object);
      if (result === "skipped") skipped += 1;
      else downloaded += 1;
    } catch (error) {
      failed += 1;
      console.error(`FAILED ${object.Key}: ${errorMessage(error)}`);
    }

    const completed = downloaded + skipped + failed;
    if (completed % 25 === 0 || completed === objects.length) {
      console.log(
        `progress ${completed}/${objects.length} downloaded=${downloaded} skipped=${skipped} failed=${failed}`,
      );
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
if (failed > 0) process.exit(2);
console.log(`Backup complete: ${root}`);
