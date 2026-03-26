import { SQSClient } from '@aws-sdk/client-sqs';

export const sqsClient = new SQSClient({
  region: process.env.AWS_REGION ?? 'eu-north-1',
});

// read at module level but don't throw — next build runs with NODE_ENV=production
// but .env.production vars aren't available during page data collection.
// consumers that actually need the URL will get '' and fail at runtime, not build time.
export const CANVAS_IMPORT_QUEUE_URL: string = process.env.SQS_QUEUE_URL ?? '';
export const EXTRACT_RETRY_QUEUE_URL: string = process.env.SQS_EXTRACT_RETRY_QUEUE_URL ?? '';
