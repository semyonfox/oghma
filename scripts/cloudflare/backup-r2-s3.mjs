#!/usr/bin/env node
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createReadStream } from 'node:fs';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { pipeline } from 'node:stream/promises';

const endpoint = process.env.STORAGE_ENDPOINT || 'https://0ad6ea198f98f461111d3fdf1abecf3c.r2.cloudflarestorage.com';
const bucket = process.env.STORAGE_BUCKET || 'oghma-notes';
const accessKeyId = process.env.STORAGE_ACCESS_KEY;
const secretAccessKey = process.env.STORAGE_SECRET_KEY;
const root = process.argv[2] || `/home/semyon/backups/oghma-r2-company-s3-${new Date().toISOString().slice(0,10)}`;
const concurrency = Number(process.env.CONCURRENCY || 8);

if (!accessKeyId || !secretAccessKey) throw new Error('Set STORAGE_ACCESS_KEY and STORAGE_SECRET_KEY');
const s3 = new S3Client({
  region: 'auto',
  endpoint,
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
});

async function listAll() {
  const out = [];
  let ContinuationToken;
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken, MaxKeys: 1000 }));
    out.push(...(res.Contents || []));
    ContinuationToken = res.NextContinuationToken;
  } while (ContinuationToken);
  return out;
}

async function existsWithSize(path, size) {
  try { return (await stat(path)).size === Number(size || 0); } catch { return false; }
}

async function download(obj) {
  const key = obj.Key;
  const out = join(root, 'objects', key);
  await mkdir(dirname(out), { recursive: true });
  if (await existsWithSize(out, obj.Size)) return 'skipped';
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  await pipeline(res.Body, createReadStream('/dev/null').destroy ? (await import('node:fs')).createWriteStream(out) : out);
  return 'downloaded';
}

await mkdir(root, { recursive: true });
const objects = await listAll();
const manifest = { endpointAccount: endpoint.match(/https:\/\/([^.]+)/)?.[1], bucket, count: objects.length, totalBytes: objects.reduce((a,o)=>a+Number(o.Size||0),0), objects: objects.map(o => ({ key: o.Key, size: o.Size, etag: o.ETag, lastModified: o.LastModified })) };
await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Manifest written: ${join(root, 'manifest.json')}`);
console.log(`Objects: ${manifest.count}; bytes: ${manifest.totalBytes}`);

let i = 0, downloaded = 0, skipped = 0, failed = 0;
async function worker() {
  for (;;) {
    const idx = i++;
    if (idx >= objects.length) return;
    const obj = objects[idx];
    try {
      const r = await download(obj);
      if (r === 'skipped') skipped++; else downloaded++;
    } catch (e) {
      failed++;
      console.error(`FAILED ${obj.Key}: ${e.message}`);
    }
    const n = downloaded + skipped + failed;
    if (n % 25 === 0 || n === objects.length) console.log(`progress ${n}/${objects.length} downloaded=${downloaded} skipped=${skipped} failed=${failed}`);
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
if (failed) process.exit(2);
console.log(`Backup complete: ${root}`);
