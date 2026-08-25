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
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";

type ObjectMetadata = Pick<
  GetObjectCommandOutput,
  "CacheControl" | "ContentDisposition" | "ContentEncoding" | "ContentType" | "Metadata"
>;

type UploadedPart = {
  ETag?: string;
  PartNumber: number;
};

const argumentsSet = new Set(process.argv.slice(2));
const dryRun = argumentsSet.has("--dry-run");
const overwrite = argumentsSet.has("--overwrite");
const partSize = Number.parseInt(
  process.env.MIGRATION_PART_SIZE_BYTES ?? `${64 * 1024 * 1024}`,
  10,
);

if (!Number.isSafeInteger(partSize) || partSize < 1) {
  throw new Error("MIGRATION_PART_SIZE_BYTES must be a positive integer");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<Uint8Array> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, Symbol.asyncIterator) === "function"
  );
}

function statusCode(error: unknown): number | undefined {
  if (!isRecord(error) || !isRecord(error.$metadata)) return undefined;
  const status = error.$metadata.httpStatusCode;
  return typeof status === "number" ? status : undefined;
}

function errorName(error: unknown): string | undefined {
  return isRecord(error) && typeof error.name === "string" ? error.name : undefined;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function clientFrom(prefix: string): S3Client {
  const endpoint = process.env[`${prefix}_STORAGE_ENDPOINT`];
  const accessKey = process.env[`${prefix}_STORAGE_ACCESS_KEY`];
  const secretKey = process.env[`${prefix}_STORAGE_SECRET_KEY`];
  const credentials =
    accessKey && secretKey
      ? { accessKeyId: accessKey, secretAccessKey: secretKey }
      : undefined;

  return new S3Client({
    region: process.env[`${prefix}_STORAGE_REGION`] ?? "us-east-1",
    ...(endpoint ? { endpoint } : {}),
    forcePathStyle: process.env[`${prefix}_STORAGE_PATH_STYLE`] === "true",
    ...(credentials ? { credentials } : {}),
  });
}

async function destinationHasObject(s3: S3Client, bucket: string, key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    const name = errorName(error);
    if (statusCode(error) === 404 || name === "NotFound" || name === "NoSuchKey") {
      return false;
    }
    throw error;
  }
}

async function putSmallObject(
  destination: S3Client,
  bucket: string,
  key: string,
  chunks: Buffer[],
  metadata: ObjectMetadata,
): Promise<void> {
  await destination.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: Buffer.concat(chunks),
      ContentType: metadata.ContentType,
      Metadata: metadata.Metadata,
      CacheControl: metadata.CacheControl,
      ContentDisposition: metadata.ContentDisposition,
      ContentEncoding: metadata.ContentEncoding,
    }),
  );
}

async function uploadPart(
  destination: S3Client,
  bucket: string,
  key: string,
  uploadId: string,
  partNumber: number,
  chunks: Buffer[],
): Promise<UploadedPart> {
  const result = await destination.send(
    new UploadPartCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
      Body: Buffer.concat(chunks),
    }),
  );

  return { PartNumber: partNumber, ETag: result.ETag };
}

async function copyObject(
  source: S3Client,
  destination: S3Client,
  sourceBucket: string,
  destinationBucket: string,
  key: string,
): Promise<void> {
  const object = await source.send(new GetObjectCommand({ Bucket: sourceBucket, Key: key }));
  if (!isAsyncIterable(object.Body)) {
    throw new Error(`Source object has no readable body: ${key}`);
  }

  const metadata: ObjectMetadata = {
    ContentType: object.ContentType,
    Metadata: object.Metadata,
    CacheControl: object.CacheControl,
    ContentDisposition: object.ContentDisposition,
    ContentEncoding: object.ContentEncoding,
  };

  let uploadId: string | undefined;
  let partNumber = 1;
  let buffered: Buffer[] = [];
  let bufferedSize = 0;
  const parts: UploadedPart[] = [];

  try {
    for await (const chunk of object.Body) {
      const buffer = Buffer.from(chunk);
      buffered.push(buffer);
      bufferedSize += buffer.length;

      if (bufferedSize < partSize) continue;

      if (!uploadId) {
        const multipart = await destination.send(
          new CreateMultipartUploadCommand({
            Bucket: destinationBucket,
            Key: key,
            ContentType: metadata.ContentType,
            Metadata: metadata.Metadata,
            CacheControl: metadata.CacheControl,
            ContentDisposition: metadata.ContentDisposition,
            ContentEncoding: metadata.ContentEncoding,
          }),
        );
        if (!multipart.UploadId) {
          throw new Error(`Destination did not return an upload ID: ${key}`);
        }
        uploadId = multipart.UploadId;
      }

      parts.push(
        await uploadPart(destination, destinationBucket, key, uploadId, partNumber, buffered),
      );
      partNumber += 1;
      buffered = [];
      bufferedSize = 0;
    }

    if (!uploadId) {
      await putSmallObject(destination, destinationBucket, key, buffered, metadata);
      return;
    }

    if (bufferedSize > 0) {
      parts.push(
        await uploadPart(destination, destinationBucket, key, uploadId, partNumber, buffered),
      );
    }

    await destination.send(
      new CompleteMultipartUploadCommand({
        Bucket: destinationBucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts },
      }),
    );
  } catch (error) {
    if (uploadId) {
      await destination
        .send(
          new AbortMultipartUploadCommand({
            Bucket: destinationBucket,
            Key: key,
            UploadId: uploadId,
          }),
        )
        .catch(() => {});
    }
    throw error;
  }
}

async function* listKeys(
  source: S3Client,
  bucket: string,
  prefix: string,
): AsyncGenerator<string> {
  let continuationToken: string | undefined;

  do {
    const page = await source.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const object of page.Contents ?? []) {
      if (object.Key) yield object.Key;
    }
    continuationToken = page.NextContinuationToken;
  } while (continuationToken);
}

async function main(): Promise<void> {
  const sourceBucket = required("SOURCE_STORAGE_BUCKET");
  const destinationBucket = required("DEST_STORAGE_BUCKET");
  const sourcePrefix = process.env.SOURCE_STORAGE_PREFIX ?? "oghma";
  const source = clientFrom("SOURCE");
  const destination = clientFrom("DEST");

  let copied = 0;
  let skipped = 0;
  let failed = 0;

  console.log(
    `${dryRun ? "Dry-run copying" : "Copying"} s3://${sourceBucket}/${sourcePrefix}/ -> s3://${destinationBucket}/${sourcePrefix}/`,
  );

  for await (const key of listKeys(source, sourceBucket, `${sourcePrefix}/`)) {
    try {
      if (!overwrite && (await destinationHasObject(destination, destinationBucket, key))) {
        skipped += 1;
        continue;
      }

      if (dryRun) {
        console.log(`[dry-run] ${key}`);
        copied += 1;
        continue;
      }

      await copyObject(source, destination, sourceBucket, destinationBucket, key);
      copied += 1;
      if (copied % 25 === 0) {
        console.log(`Copied ${copied} object(s), skipped ${skipped}, failed ${failed}`);
      }
    } catch (error) {
      failed += 1;
      console.error(`Failed ${key}: ${errorMessage(error)}`);
    }
  }

  console.log(`Done. copied=${copied} skipped=${skipped} failed=${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(errorMessage(error));
  process.exit(1);
});
