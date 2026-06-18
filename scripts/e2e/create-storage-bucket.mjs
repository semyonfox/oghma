#!/usr/bin/env node

import {
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { loadE2EEnvFiles } from "./lib/env.mjs";

loadE2EEnvFiles();

const bucket = process.env.STORAGE_BUCKET;
const endpoint = process.env.STORAGE_ENDPOINT;

if (!bucket) {
  console.error("[e2e] STORAGE_BUCKET is required");
  process.exit(1);
}

const client = new S3Client({
  region: process.env.STORAGE_REGION || "us-east-1",
  endpoint,
  forcePathStyle: process.env.STORAGE_PATH_STYLE === "true",
  credentials:
    process.env.STORAGE_ACCESS_KEY && process.env.STORAGE_SECRET_KEY
      ? {
          accessKeyId: process.env.STORAGE_ACCESS_KEY,
          secretAccessKey: process.env.STORAGE_SECRET_KEY,
        }
      : undefined,
});

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  let lastError;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch {
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
      }
      console.log(`[e2e] storage bucket ready: ${bucket}`);
      return;
    } catch (error) {
      lastError = error;
      await sleep(1000);
    }
  }

  throw lastError;
}

main().catch((error) => {
  console.error("[e2e] storage bucket setup failed:", error.message);
  process.exit(1);
});

