import { SQSClient } from "@aws-sdk/client-sqs";

export const sqsClient = new SQSClient({
  region: process.env.AWS_REGION ?? "eu-north-1",
});

// lazy getters — read process.env at call time, not module-load time.
// next build unsets runtime env vars so module-level reads would bake in ''.
// these ensure the URL is always resolved from the live runtime environment.
export function getCanvasImportQueueUrl(): string {
  return process.env.SQS_QUEUE_URL ?? "";
}

export function getExtractRetryQueueUrl(): string {
  return process.env.SQS_EXTRACT_RETRY_QUEUE_URL ?? "";
}

// keep the old exports as aliases so existing callers don't break during migration.
// these still read at module-load time — prefer the getter functions above.
export const CANVAS_IMPORT_QUEUE_URL: string = process.env.SQS_QUEUE_URL ?? "";
export const EXTRACT_RETRY_QUEUE_URL: string =
  process.env.SQS_EXTRACT_RETRY_QUEUE_URL ?? "";
