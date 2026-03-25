import { SQSClient } from '@aws-sdk/client-sqs';

export const sqsClient = new SQSClient({
  region: process.env.AWS_REGION ?? 'eu-north-1',
});

// warn instead of crashing — lets the import route fall back to local processing
if (!process.env.SQS_QUEUE_URL && process.env.NODE_ENV === 'production') {
  throw new Error('SQS_QUEUE_URL environment variable is not set');
}
export const CANVAS_IMPORT_QUEUE_URL: string = process.env.SQS_QUEUE_URL ?? '';
