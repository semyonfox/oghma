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

// removed stale module-level exports — they bake in "" during next build
// because env vars are unset at build time. use the getter functions above.
