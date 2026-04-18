#!/usr/bin/env node

// applies CORS configuration to the S3 storage bucket
// run once at deploy time (amplify.yml prebuild) or manually
// idempotent — safe to re-run

import {
  S3Client,
  PutBucketCorsCommand,
  GetBucketCorsCommand,
} from "@aws-sdk/client-s3";

const bucket = process.env.STORAGE_BUCKET;
const region = process.env.STORAGE_REGION || "eu-west-1";
const accessKey = process.env.STORAGE_ACCESS_KEY;
const secretKey = process.env.STORAGE_SECRET_KEY;

if (!bucket) {
  console.log("configure-s3-cors: STORAGE_BUCKET not set, skipping");
  process.exit(0);
}

const client = new S3Client({
  region,
  ...(accessKey && secretKey
    ? { credentials: { accessKeyId: accessKey, secretAccessKey: secretKey } }
    : {}),
});

const CORS_RULES = [
  {
    ID: "oghmanotes-browser-get",
    AllowedOrigins: [
      "https://oghmanotes.ie",
      "https://www.oghmanotes.ie",
      "https://dev.oghmanotes.ie",
      "http://localhost:3000",
      "http://localhost:3001",
    ],
    AllowedMethods: ["GET", "HEAD"],
    AllowedHeaders: ["*"],
    ExposeHeaders: ["Content-Length", "Content-Type", "ETag"],
    MaxAgeSeconds: 3600,
  },
];

async function run() {
  // check current config first to avoid unnecessary writes
  try {
    const { CORSRules } = await client.send(
      new GetBucketCorsCommand({ Bucket: bucket }),
    );
    const existing = JSON.stringify(CORSRules ?? []);
    const desired = JSON.stringify(CORS_RULES);
    if (existing === desired) {
      console.log("configure-s3-cors: CORS already up to date, skipping");
      return;
    }
  } catch {
    // NoSuchCORSConfiguration — bucket has no CORS yet, proceed to set it
  }

  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: { CORSRules: CORS_RULES },
    }),
  );

  console.log(`configure-s3-cors: applied CORS to bucket ${bucket}`);
}

run().catch((err) => {
  console.error("configure-s3-cors: failed:", err.message);
  // non-fatal — don't fail the build if CORS config fails
  process.exit(0);
});
