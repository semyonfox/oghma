import { SQSClient } from '@aws-sdk/client-sqs';

export const sqsClient = new SQSClient({
  region: process.env.AWS_REGION ?? 'eu-north-1',
});

if (!process.env.SQS_QUEUE_URL) {
  throw new Error('SQS_QUEUE_URL environment variable is not set');
}
export const CANVAS_IMPORT_QUEUE_URL: string = process.env.SQS_QUEUE_URL;
