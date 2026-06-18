#!/usr/bin/env node

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const overwrite = args.has("--overwrite");
const partSize = parseInt(process.env.MIGRATION_PART_SIZE_BYTES ?? `${64 * 1024 * 1024}`, 10);

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function clientFrom(prefix) {
  const endpoint = process.env[`${prefix}_STORAGE_ENDPOINT`];
  const accessKey = process.env[`${prefix}_STORAGE_ACCESS_KEY`];
  const secretKey = process.env[`${prefix}_STORAGE_SECRET_KEY`];

  return new S3Client({
    region: process.env[`${prefix}_STORAGE_REGION`] ?? "us-east-1",
    ...(endpoint && { endpoint }),
    forcePathStyle: process.env[`${prefix}_STORAGE_PATH_STYLE`] === "true",
    ...(accessKey && secretKey && {
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
    }),
  });
}

async function destinationHasObject(s3, bucket, key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode;
    if (status === 404 || error?.name === "NotFound" || error?.name === "NoSuchKey") return false;
    throw error;
  }
}

async function putSmallObject(dest, bucket, key, chunks, meta) {
  await dest.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: Buffer.concat(chunks),
      ContentType: meta.contentType,
      Metadata: meta.metadata,
      CacheControl: meta.cacheControl,
      ContentDisposition: meta.contentDisposition,
      ContentEncoding: meta.contentEncoding,
    }),
  );
}

async function uploadPart(dest, bucket, key, uploadId, partNumber, chunks) {
  const body = Buffer.concat(chunks);
  const result = await dest.send(
    new UploadPartCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
      Body: body,
    }),
  );
  return { PartNumber: partNumber, ETag: result.ETag };
}

async function copyObject(source, dest, sourceBucket, destBucket, key) {
  const object = await source.send(new GetObjectCommand({ Bucket: sourceBucket, Key: key }));
  if (!object.Body) throw new Error(`Source object has no body: ${key}`);

  const meta = {
    contentType: object.ContentType,
    metadata: object.Metadata,
    cacheControl: object.CacheControl,
    contentDisposition: object.ContentDisposition,
    contentEncoding: object.ContentEncoding,
  };

  let uploadId = null;
  let partNumber = 1;
  let buffered = [];
  let bufferedSize = 0;
  const parts = [];

  try {
    for await (const chunk of object.Body) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      buffered.push(buffer);
      bufferedSize += buffer.length;

      if (bufferedSize < partSize) continue;

      if (!uploadId) {
        const multipart = await dest.send(
          new CreateMultipartUploadCommand({
            Bucket: destBucket,
            Key: key,
            ContentType: meta.contentType,
            Metadata: meta.metadata,
            CacheControl: meta.cacheControl,
            ContentDisposition: meta.contentDisposition,
            ContentEncoding: meta.contentEncoding,
          }),
        );
        uploadId = multipart.UploadId;
      }

      parts.push(await uploadPart(dest, destBucket, key, uploadId, partNumber, buffered));
      partNumber += 1;
      buffered = [];
      bufferedSize = 0;
    }

    if (!uploadId) {
      await putSmallObject(dest, destBucket, key, buffered, meta);
      return;
    }

    if (bufferedSize > 0) {
      parts.push(await uploadPart(dest, destBucket, key, uploadId, partNumber, buffered));
    }

    await dest.send(
      new CompleteMultipartUploadCommand({
        Bucket: destBucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts },
      }),
    );
  } catch (error) {
    if (uploadId) {
      await dest
        .send(new AbortMultipartUploadCommand({ Bucket: destBucket, Key: key, UploadId: uploadId }))
        .catch(() => {});
    }
    throw error;
  }
}

async function* listKeys(source, bucket, prefix) {
  let ContinuationToken;
  do {
    const page = await source.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken,
      }),
    );
    for (const object of page.Contents ?? []) {
      if (object.Key) yield object.Key;
    }
    ContinuationToken = page.NextContinuationToken;
  } while (ContinuationToken);
}

async function main() {
  const sourceBucket = required("SOURCE_STORAGE_BUCKET");
  const destBucket = required("DEST_STORAGE_BUCKET");
  const sourcePrefix = process.env.SOURCE_STORAGE_PREFIX ?? "oghma";
  const source = clientFrom("SOURCE");
  const dest = clientFrom("DEST");

  let copied = 0;
  let skipped = 0;
  let failed = 0;

  console.log(
    `${dryRun ? "Dry-run copying" : "Copying"} s3://${sourceBucket}/${sourcePrefix}/ -> s3://${destBucket}/${sourcePrefix}/`,
  );

  for await (const key of listKeys(source, sourceBucket, `${sourcePrefix}/`)) {
    try {
      if (!overwrite && (await destinationHasObject(dest, destBucket, key))) {
        skipped += 1;
        continue;
      }

      if (dryRun) {
        console.log(`[dry-run] ${key}`);
        copied += 1;
        continue;
      }

      await copyObject(source, dest, sourceBucket, destBucket, key);
      copied += 1;
      if (copied % 25 === 0) {
        console.log(`Copied ${copied} object(s), skipped ${skipped}, failed ${failed}`);
      }
    } catch (error) {
      failed += 1;
      console.error(`Failed ${key}: ${error.message}`);
    }
  }

  console.log(`Done. copied=${copied} skipped=${skipped} failed=${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
