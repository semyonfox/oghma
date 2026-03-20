import { SQSClient } from '@aws-sdk/client-sqs';

export const sqsClient = new SQSClient({
  region: process.env.AWS_REGION ?? 'eu-north-1',
});

export const CANVAS_IMPORT_QUEUE_URL = process.env.SQS_QUEUE_URL!;
